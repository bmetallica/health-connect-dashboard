package de.health.phapp

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

/**
 * HTTP calls to the health server: measurements go to the ingest address (may
 * be public via reverse proxy), everything else to the web interface, which is
 * only reachable in the home network.
 */
object Server {
    private const val SOURCE = "ph-app"

    private class Resp(val code: Int, val body: String)

    private fun call(url: String, method: String = "GET", json: String? = null, token: String = ""): Resp {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = 8000
            c.readTimeout = 15000
            c.setRequestProperty("Accept", "application/json")
            if (json != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                c.setRequestProperty("X-Source", SOURCE)
                if (token.isNotEmpty()) c.setRequestProperty("X-Ingest-Token", token)
                c.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
            }
            val code = c.responseCode
            val body = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            return Resp(code, body)
        } finally {
            c.disconnect()
        }
    }

    /** same format as before: {date, time, timestamp, phValue}; phValue is a JSON number */
    fun payload(m: Measurement): String {
        val z = Instant.ofEpochMilli(m.time).atZone(ZoneId.systemDefault())
        return JSONObject()
            .put("date", z.format(DateTimeFormatter.ISO_LOCAL_DATE))
            .put("time", z.format(DateTimeFormatter.ofPattern("HH:mm:ss")))
            .put("timestamp", m.time)
            .put("phValue", m.value)
            .toString()
    }

    /** sends all unsent measurements; returns an error text or null */
    suspend fun push(ctx: Context): String? = withContext(Dispatchers.IO) {
        val prefs = Prefs(ctx)
        val store = Store(ctx)
        if (!prefs.configured) return@withContext "Server nicht eingerichtet"
        try {
            for (m in store.unsynced()) {
                val r = call(prefs.ingest, "POST", payload(m), prefs.token)
                if (r.code == 401) throw RuntimeException("Token fehlt oder ist falsch")
                if (r.code !in 200..299) throw RuntimeException("Server antwortet mit ${r.code}")
                store.markSynced(m.id, m.value)
            }
            prefs.lastSync = System.currentTimeMillis()
            prefs.lastError = ""
            null
        } catch (e: Exception) {
            prefs.lastError = e.message ?: e.javaClass.simpleName
            prefs.lastError
        }
    }

    private fun err(e: Exception) = e.message ?: e.javaClass.simpleName

    /** ingest test: an empty payload is accepted by the server but not stored */
    suspend fun testIngest(prefs: Prefs): String? = withContext(Dispatchers.IO) {
        try {
            val r = call(prefs.ingest, "POST", "[]", prefs.token)
            when (r.code) {
                in 200..299 -> null
                401 -> "Token fehlt oder ist falsch"
                404 -> "Adresse falsch (HTTP 404) – endet sie auf /ingest?"
                else -> "HTTP ${r.code}"
            }
        } catch (e: Exception) {
            err(e)
        }
    }

    suspend fun testWeb(prefs: Prefs): String? = withContext(Dispatchers.IO) {
        try {
            val r = call(prefs.web + "/health")
            if (r.code in 200..299 && r.body.contains("\"ok\"")) null else "HTTP ${r.code}"
        } catch (e: Exception) {
            err(e)
        }
    }

    /** target range from the profile in the web interface */
    suspend fun fetchTarget(prefs: Prefs): Pair<Double, Double>? = withContext(Dispatchers.IO) {
        val r = call(prefs.web + "/api/v2/profile")
        if (r.code !in 200..299) throw RuntimeException("HTTP ${r.code}")
        val p = JSONObject(r.body).optJSONObject("profile") ?: return@withContext null
        if (!p.has("phTargetMin") || !p.has("phTargetMax") || p.isNull("phTargetMin") || p.isNull("phTargetMax")) return@withContext null
        p.getDouble("phTargetMin") to p.getDouble("phTargetMax")
    }

    private fun serverItems(prefs: Prefs, from: String, to: String): List<JSONObject> {
        val out = ArrayList<JSONObject>()
        var page = 1
        while (true) {
            val r = call(prefs.web + "/api/v2/edit/samples/ph?from=$from&to=$to&size=500&page=$page")
            if (r.code !in 200..299) throw RuntimeException("HTTP ${r.code}")
            val o = JSONObject(r.body)
            val items = o.getJSONArray("items")
            for (i in 0 until items.length()) out += items.getJSONObject(i)
            if (out.size >= o.getInt("total") || items.length() == 0) break
            page++
        }
        return out
    }

    /** all pH values stored on the server (corrected values, without deleted ones) */
    suspend fun importAll(ctx: Context): Int = withContext(Dispatchers.IO) {
        val prefs = Prefs(ctx)
        val today = LocalDate.now().plusDays(1).toString()
        val items = serverItems(prefs, "2000-01-01", today)
            .filter { !it.optBoolean("deleted") && !it.isNull("value") }
            .map { it.getLong("time") to it.getDouble("value") }
        Store(ctx).importFromServer(items)
    }

    /** deletes the value at this time on the server too (it stays restorable there) */
    suspend fun deleteRemote(prefs: Prefs, time: Long): Boolean = withContext(Dispatchers.IO) {
        if (!prefs.webConfigured) return@withContext false
        val day = Instant.ofEpochMilli(time).atZone(ZoneId.systemDefault()).toLocalDate()
        val hit = serverItems(prefs, day.minusDays(1).toString(), day.plusDays(1).toString())
            .firstOrNull { it.optLong("rawTime") == time || it.optLong("time") == time } ?: return@withContext false
        if (hit.optBoolean("deleted")) return@withContext true
        call(prefs.web + "/api/v2/edit/samples/" + hit.getLong("id"), "DELETE").code in 200..299
    }
}

/** sends in the background as soon as a network is available, retries on errors */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        if (!Prefs(applicationContext).configured) return Result.success()
        return if (Server.push(applicationContext) == null) Result.success() else Result.retry()
    }

    companion object {
        fun schedule(ctx: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork("ph-sync", ExistingWorkPolicy.APPEND_OR_REPLACE, req)
        }
    }
}
