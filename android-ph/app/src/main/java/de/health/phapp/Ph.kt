package de.health.phapp

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * pH input from the in-app keypad. The keypad has exactly one decimal key, so
 * "," and "." can never be mixed up, and a forgotten comma is repaired:
 * "68" -> 6,8 and "675" -> 6,75 (a pH above 14 does not exist).
 */
object PhInput {
    const val MAX = 14.0

    /** applies one keypad key ('0'..'9', ',' or '<' for backspace) */
    fun press(cur: String, key: Char): String = when (key) {
        '<' -> cur.dropLast(1)
        ',' -> when {
            cur.contains(',') -> cur
            cur.isEmpty() -> "0,"
            else -> "$cur,"
        }
        else -> {
            val comma = cur.indexOf(',')
            when {
                comma >= 0 && cur.length - comma - 1 >= 2 -> cur // max. 2 decimals
                comma < 0 && cur.length >= 3 -> cur // max. 3 digits without comma
                cur == "0" -> key.toString()
                else -> cur + key
            }
        }
    }

    data class Parsed(val value: Double?, val autoComma: Boolean)

    fun parse(s: String): Parsed {
        if (s.isEmpty()) return Parsed(null, false)
        if (s.contains(',')) {
            val v = s.replace(',', '.').toDoubleOrNull()
            return Parsed(v?.takeIf { it in 0.0..MAX }, false)
        }
        val n = s.toIntOrNull() ?: return Parsed(null, false)
        if (n > MAX) {
            val v = (s.substring(0, 1) + "." + s.substring(1)).toDouble()
            return Parsed(v, true)
        }
        return Parsed(n.toDouble(), false)
    }

    /** value -> keypad text, e.g. 6.8 -> "6,8" */
    fun text(v: Double): String = fmt(v)
}

/** lenient number parsing for text fields (accepts "," and ".") */
fun parseNumber(s: String): Double? = s.trim().replace(',', '.').toDoubleOrNull()

private val DF = DecimalFormat("0.0#", DecimalFormatSymbols(Locale.GERMANY))
private val DF1 = DecimalFormat("0.0", DecimalFormatSymbols(Locale.GERMANY))

fun fmt(v: Double): String = DF.format(v)
fun fmt1(v: Double): String = DF1.format(v)
fun round2(v: Double): Double = (v * 100).roundToInt() / 100.0

enum class Status(val label: String, val icon: String) { OK("gut", "✓"), WARN("mittel", "!"), CRIT("kritisch", "✕") }

/** same rule as the web interface: distance to the target range */
fun deviation(v: Double, min: Double, max: Double): Double = when {
    v < min -> v - min
    v > max -> v - max
    else -> 0.0
}

fun status(v: Double, min: Double, max: Double): Status {
    val d = abs(deviation(v, min, max))
    return if (d <= 0.2) Status.OK else if (d <= 0.5) Status.WARN else Status.CRIT
}

fun isUnusual(v: Double) = v < 4.0 || v > 9.0
