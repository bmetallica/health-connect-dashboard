package de.health.hcbridge

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Duration
import java.time.Instant
import kotlin.reflect.KClass

/**
 * Reads Health Connect and fills the outbox.
 *  - first run per type: full read (whole history if permitted, else 30 days),
 *    the changes token is taken BEFORE the read so nothing in between is missed
 *  - later runs: only changes since the stored token (getChanges)
 *  - expired token: re-read from the last successful sync
 * The token is advanced only after the data is safely in the outbox.
 */
class SyncEngine(private val ctx: Context) {
    companion object {
        val lock = Mutex()
        const val CHUNK = 2000
    }

    private val prefs = Prefs(ctx)
    private val outbox = Outbox(ctx, prefs)
    private val client by lazy { HealthConnectClient.getOrCreate(ctx) }
    private val seenSources = mutableSetOf<String>()

    data class Summary(val read: Int, val sent: Int, val types: Int, val deletions: Int)

    suspend fun run(): Summary = lock.withLock {
        if (HealthConnectClient.getSdkStatus(ctx) != HealthConnectClient.SDK_AVAILABLE) {
            throw IllegalStateException("Health Connect ist auf diesem Gerät nicht verfügbar")
        }
        val granted = client.permissionController.getGrantedPermissions()
        val history = HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY in granted
        val types = Types.ALL.filter { it.key !in prefs.disabledTypes && it.permission in granted }
        if (types.isEmpty()) throw IllegalStateException("Keine Health-Connect-Berechtigungen erteilt")

        var read = 0
        var deletions = 0
        for (t in types) {
            val token = prefs.token(t)
            if (token == null) {
                val start = if (history) Instant.now().minus(Duration.ofDays(3650)) else Instant.now().minus(Duration.ofDays(30))
                read += initial(t, start)
            } else {
                val r = changes(t, token)
                read += r.first
                deletions += r.second
            }
        }
        if (seenSources.isNotEmpty()) prefs.sources = prefs.sources + seenSources
        val sent = outbox.flush()
        Summary(read, sent, types.size, deletions)
    }

    private fun keep(r: Record): Boolean {
        val pkg = r.metadata.dataOrigin.packageName
        seenSources.add(pkg)
        return pkg !in prefs.excludedSources
    }

    private fun enqueue(t: TypeDef, recs: List<Record>) {
        if (recs.isEmpty()) return
        recs.chunked(CHUNK).forEach { part ->
            outbox.put(Json.payload(mapOf(t to part)).toString(), part.size)
        }
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun initial(t: TypeDef, start: Instant): Int {
        val newToken = client.getChangesToken(ChangesTokenRequest(setOf(t.cls)))
        val cls = t.cls as KClass<Record>
        var pageToken: String? = null
        val buf = ArrayList<Record>()
        var total = 0
        do {
            val resp = client.readRecords(
                ReadRecordsRequest(cls, TimeRangeFilter.between(start, Instant.now().plus(Duration.ofDays(1))), pageSize = 1000, pageToken = pageToken)
            )
            buf.addAll(resp.records.filter { keep(it) })
            if (buf.size >= CHUNK) {
                enqueue(t, buf); total += buf.size; buf.clear()
            }
            pageToken = resp.pageToken
        } while (!pageToken.isNullOrEmpty())
        enqueue(t, buf); total += buf.size
        prefs.setToken(t, newToken)
        if (total > 0) prefs.log("${t.label}: $total Einträge (Erstbefüllung)")
        return total
    }

    private suspend fun changes(t: TypeDef, startToken: String): Pair<Int, Int> {
        var token = startToken
        val buf = ArrayList<Record>()
        var deletions = 0
        while (true) {
            val resp = try {
                client.getChanges(token)
            } catch (e: Exception) {
                prefs.log("${t.label}: Token ungültig (${e.message}), lese neu")
                null
            }
            if (resp == null || resp.changesTokenExpired) {
                // fall back to a time-based read from the last successful sync
                enqueue(t, buf)
                prefs.setToken(t, null)
                val since = if (prefs.lastSuccess > 0) Instant.ofEpochMilli(prefs.lastSuccess).minus(Duration.ofDays(1)) else Instant.now().minus(Duration.ofDays(30))
                return Pair(buf.size + initial(t, since), deletions)
            }
            for (c in resp.changes) {
                when (c) {
                    is UpsertionChange -> if (keep(c.record)) buf.add(c.record)
                    is DeletionChange -> deletions++
                    else -> {}
                }
            }
            token = resp.nextChangesToken
            if (buf.size >= CHUNK) {
                enqueue(t, buf)
                prefs.setToken(t, token)
                buf.clear()
            }
            if (!resp.hasMore) break
        }
        enqueue(t, buf)
        prefs.setToken(t, token)
        return Pair(buf.size, deletions)
    }
}
