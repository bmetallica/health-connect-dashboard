package de.health.hcbridge

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPOutputStream

/**
 * Durable outbox: every payload is written to disk (gzip) BEFORE the change
 * token is advanced, and only deleted after the server accepted it. Nothing is
 * lost when the server or the network is unavailable.
 */
class Outbox(private val ctx: Context, private val prefs: Prefs) {
    private val dir = File(ctx.filesDir, "outbox").apply { mkdirs() }

    fun files(): List<File> = dir.listFiles()?.filter { it.name.endsWith(".json.gz") }?.sortedBy { it.name } ?: emptyList()
    fun size() = files().size

    fun put(json: String, count: Int) {
        val name = "%013d-%06d-%d.json.gz".format(System.currentTimeMillis(), (Math.random() * 999999).toInt(), count)
        val tmp = File(dir, "$name.tmp")
        GZIPOutputStream(tmp.outputStream()).use { it.write(json.toByteArray(Charsets.UTF_8)) }
        tmp.renameTo(File(dir, name))
    }

    /** send queued payloads in order; stops at the first failure. Returns records sent. */
    fun flush(): Int {
        val url = prefs.serverUrl
        if (url.isBlank()) throw IllegalStateException("Keine Server-Adresse eingetragen")
        var sent = 0
        for (f in files()) {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 15000
                readTimeout = 60000
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Content-Encoding", "gzip")
                setRequestProperty("X-Source", "hc-bridge")
                setFixedLengthStreamingMode(f.length())
            }
            try {
                conn.outputStream.use { out -> f.inputStream().use { it.copyTo(out) } }
                val code = conn.responseCode
                if (code !in 200..299) throw IllegalStateException("Server antwortet mit HTTP $code")
                sent += f.name.substringAfterLast('-').removeSuffix(".json.gz").toIntOrNull() ?: 0
                f.delete()
            } finally {
                conn.disconnect()
            }
        }
        return sent
    }
}
