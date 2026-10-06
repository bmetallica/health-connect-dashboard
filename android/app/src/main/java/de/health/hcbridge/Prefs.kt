package de.health.hcbridge

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Settings, per-type change tokens, statistics and a small log. */
class Prefs(ctx: Context) {
    private val p = ctx.getSharedPreferences("hcbridge", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = p.getString("serverUrl", "") ?: ""
        set(v) = p.edit().putString("serverUrl", v.trim()).apply()
    /** optional token of the ingest port, sent as X-Ingest-Token */
    var ingestToken: String
        get() = p.getString("ingestToken", "") ?: ""
        set(v) = p.edit().putString("ingestToken", v.trim()).apply()
    var intervalMin: Int
        get() = p.getInt("intervalMin", 15)
        set(v) = p.edit().putInt("intervalMin", v).apply()
    var enabled: Boolean
        get() = p.getBoolean("enabled", false)
        set(v) = p.edit().putBoolean("enabled", v).apply()
    var disabledTypes: Set<String>
        get() = p.getStringSet("disabledTypes", emptySet()) ?: emptySet()
        set(v) = p.edit().putStringSet("disabledTypes", v).apply()
    /** package names whose data is not transferred (empty = all sources) */
    var excludedSources: Set<String>
        get() = p.getStringSet("excludedSources", emptySet()) ?: emptySet()
        set(v) = p.edit().putStringSet("excludedSources", v).apply()

    fun token(t: TypeDef): String? = p.getString("token_" + t.key, null)
    fun setToken(t: TypeDef, v: String?) = p.edit().apply { if (v == null) remove("token_" + t.key) else putString("token_" + t.key, v) }.commit()
    fun clearTokens() = p.edit().apply { Types.ALL.forEach { remove("token_" + it.key) } }.commit()

    var lastSuccess: Long
        get() = p.getLong("lastSuccess", 0)
        set(v) = p.edit().putLong("lastSuccess", v).apply()
    var lastRun: Long
        get() = p.getLong("lastRun", 0)
        set(v) = p.edit().putLong("lastRun", v).apply()
    var totalRecords: Long
        get() = p.getLong("totalRecords", 0)
        set(v) = p.edit().putLong("totalRecords", v).apply()
    var lastError: String
        get() = p.getString("lastError", "") ?: ""
        set(v) = p.edit().putString("lastError", v).apply()
    var sources: Set<String>
        get() = p.getStringSet("sources", emptySet()) ?: emptySet()
        set(v) = p.edit().putStringSet("sources", v).apply()

    fun log(msg: String) {
        val line = SimpleDateFormat("dd.MM. HH:mm:ss", Locale.GERMANY).format(Date()) + "  " + msg
        val lines = (listOf(line) + logLines()).take(200)
        p.edit().putString("log", lines.joinToString("\n")).apply()
    }
    fun logLines(): List<String> = (p.getString("log", "") ?: "").split("\n").filter { it.isNotBlank() }
}
