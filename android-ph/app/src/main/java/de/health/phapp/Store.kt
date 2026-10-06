package de.health.phapp

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class Measurement(val id: Long, val time: Long, val value: Double, val synced: Boolean)

/** Local copy of all measurements. The app works fully offline; unsent values are marked. */
class Store(ctx: Context) : SQLiteOpenHelper(ctx.applicationContext, "ph.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE m (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                time INTEGER NOT NULL UNIQUE,
                value REAL NOT NULL,
                synced INTEGER NOT NULL DEFAULT 0
            )"""
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    private fun query(where: String? = null, args: Array<String>? = null): List<Measurement> =
        readableDatabase.query("m", null, where, args, null, null, "time").use { c ->
            val out = ArrayList<Measurement>(c.count)
            while (c.moveToNext()) out += Measurement(c.getLong(0), c.getLong(1), c.getDouble(2), c.getInt(3) == 1)
            out
        }

    fun all(): List<Measurement> = query()
    fun unsynced(): List<Measurement> = query("synced = 0")
    fun pendingCount(): Int = unsynced().size

    /** new measurement; two values in the same millisecond are not possible, the time is shifted */
    fun add(time: Long, value: Double): Long {
        var t = time
        while (query("time = ?", arrayOf(t.toString())).isNotEmpty()) t++
        return writableDatabase.insert("m", null, ContentValues().apply {
            put("time", t); put("value", value); put("synced", 0)
        })
    }

    fun update(id: Long, time: Long, value: Double) {
        writableDatabase.update("m", ContentValues().apply {
            put("time", time); put("value", value); put("synced", 0)
        }, "id = ?", arrayOf(id.toString()))
    }

    fun delete(id: Long) {
        writableDatabase.delete("m", "id = ?", arrayOf(id.toString()))
    }

    fun markSynced(id: Long, value: Double) {
        // only if unchanged since it was sent
        writableDatabase.update("m", ContentValues().apply { put("synced", 1) }, "id = ? AND value = ?", arrayOf(id.toString(), value.toString()))
    }

    /** values from the server: new ones are added, local unsent changes win */
    fun importFromServer(items: List<Pair<Long, Double>>): Int {
        var added = 0
        val db = writableDatabase
        db.beginTransaction()
        try {
            for ((time, value) in items) {
                val cv = ContentValues().apply { put("time", time); put("value", value); put("synced", 1) }
                if (db.insertWithOnConflict("m", null, cv, SQLiteDatabase.CONFLICT_IGNORE) != -1L) added++
                else db.update("m", ContentValues().apply { put("value", value) }, "time = ? AND synced = 1", arrayOf(time.toString()))
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return added
    }
}

/** Server connection and target range (Setup screen). */
class Prefs(ctx: Context) {
    private val p = ctx.applicationContext.getSharedPreferences("ph", Context.MODE_PRIVATE)

    init {
        // version 1.0 stored host + ports; turn them into the two addresses
        val oldHost = p.getString("host", null)
        if (!oldHost.isNullOrBlank() && !p.contains("ingestUrl")) {
            val h = oldHost.substringAfter("://").substringBefore('/').substringBefore(':')
            p.edit()
                .putString("ingestUrl", "http://$h:${p.getInt("ingestPort", 8321)}/ingest")
                .putString("webUrl", "http://$h:${p.getInt("webPort", 8322)}")
                .remove("host").remove("ingestPort").remove("webPort")
                .apply()
        }
    }

    /** where measurements are sent, e.g. https://health.example.de/ingest (reverse proxy) */
    var ingestUrl: String
        get() = p.getString("ingestUrl", "") ?: ""
        set(v) = p.edit().putString("ingestUrl", v.trim()).apply()
    /** optional token, sent as X-Ingest-Token */
    var token: String
        get() = p.getString("token", "") ?: ""
        set(v) = p.edit().putString("token", v.trim()).apply()
    /** web interface in the home network, e.g. http://192.168.1.10:8322 */
    var webUrl: String
        get() = p.getString("webUrl", "") ?: ""
        set(v) = p.edit().putString("webUrl", v.trim()).apply()
    var targetMin: Double
        get() = p.getFloat("tMin", 7.0f).toDouble()
        set(v) = p.edit().putFloat("tMin", v.toFloat()).apply()
    var targetMax: Double
        get() = p.getFloat("tMax", 7.2f).toDouble()
        set(v) = p.edit().putFloat("tMax", v.toFloat()).apply()
    var lastSync: Long
        get() = p.getLong("lastSync", 0)
        set(v) = p.edit().putLong("lastSync", v).apply()
    var lastError: String
        get() = p.getString("lastError", "") ?: ""
        set(v) = p.edit().putString("lastError", v).apply()
    var range: Int
        get() = p.getInt("range", 1)
        set(v) = p.edit().putInt("range", v).apply()

    val configured get() = ingestUrl.isNotBlank()
    val webConfigured get() = webUrl.isNotBlank()

    /** without a scheme: https for the ingest address (reverse proxy), http in the home network */
    val ingest get() = withScheme(ingestUrl, "https")
    val web get() = withScheme(webUrl, "http").trimEnd('/')

    private fun withScheme(u: String, def: String) = if (u.contains("://")) u.trim() else "$def://${u.trim()}"
}
