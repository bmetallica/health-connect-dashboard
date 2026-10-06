package de.health.phapp

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.ceil
import kotlin.math.floor

private val DAY_FMT = DateTimeFormatter.ofPattern("dd.MM.")
private val TIP_FMT = DateTimeFormatter.ofPattern("dd.MM. HH:mm")
private fun Long.zoned() = Instant.ofEpochMilli(this).atZone(ZoneId.systemDefault())

/**
 * Course of the single measurements: target band, line, points colored by
 * status. Draws in from left to right; tapping a point shows its value.
 */
@Composable
fun LineChart(data: List<Measurement>, from: Long, to: Long, tMin: Double, tMax: Double, animKey: Any) {
    val measurer = rememberTextMeasurer()
    val progress = remember { Animatable(0f) }
    LaunchedEffect(animKey) {
        progress.snapTo(0f)
        progress.animateTo(1f, tween(900, easing = FastOutSlowInEasing))
    }
    var selected by remember(animKey) { mutableStateOf<Measurement?>(null) }
    val pts = remember(data) { data.sortedBy { it.time } }

    val lo = floor(minOf(pts.minOfOrNull { it.value } ?: tMin, tMin) - 0.5)
    val hi = ceil(maxOf(pts.maxOfOrNull { it.value } ?: tMax, tMax) + 0.5)
    val span = (to - from).coerceAtLeast(1L)
    val label = TextStyle(color = C.Faint, fontSize = 10.sp)

    Canvas(
        Modifier.fillMaxWidth().height(230.dp).pointerInput(pts, from, to) {
            detectTapGestures { tap ->
                val left = 30.dp.toPx(); val right = size.width - 8.dp.toPx()
                val top = 10.dp.toPx(); val bottom = size.height - 22.dp.toPx()
                selected = pts.minByOrNull {
                    val x = left + (it.time - from).toFloat() / span * (right - left)
                    val y = bottom - ((it.value - lo) / (hi - lo)).toFloat() * (bottom - top)
                    Offset(x, y).dist2(tap)
                }?.takeIf {
                    val x = left + (it.time - from).toFloat() / span * (right - left)
                    kotlin.math.abs(x - tap.x) < 40.dp.toPx()
                }
            }
        }
    ) {
        val left = 30.dp.toPx(); val right = size.width - 8.dp.toPx()
        val top = 10.dp.toPx(); val bottom = size.height - 22.dp.toPx()
        fun x(t: Long) = left + (t - from).toFloat() / span * (right - left)
        fun y(v: Double) = bottom - ((v - lo) / (hi - lo)).toFloat() * (bottom - top)

        // grid + y labels (every whole pH unit)
        var g = lo
        while (g <= hi + 1e-9) {
            val yy = y(g)
            drawLine(C.Border, Offset(left, yy), Offset(right, yy), 1f)
            val tl = measurer.measure(g.toInt().toString(), label)
            drawText(tl, topLeft = Offset(left - tl.size.width - 8.dp.toPx(), yy - tl.size.height / 2))
            g += 1.0
        }
        // target band
        drawRect(C.Ok.copy(alpha = 0.10f), Offset(left, y(tMax)), Size(right - left, y(tMin) - y(tMax)))
        drawLine(C.Ok.copy(alpha = 0.35f), Offset(left, y(tMax)), Offset(right, y(tMax)), 1f)
        drawLine(C.Ok.copy(alpha = 0.35f), Offset(left, y(tMin)), Offset(right, y(tMin)), 1f)

        // x labels: about 4 dates
        val n = 4
        for (i in 0..n) {
            val t = from + span * i / n
            val tl = measurer.measure(t.zoned().format(DAY_FMT), label)
            val cx = (x(t) - tl.size.width / 2).coerceIn(left - 4f, right - tl.size.width)
            drawText(tl, topLeft = Offset(cx, bottom + 6.dp.toPx()))
        }

        if (pts.isEmpty()) return@Canvas
        val reveal = left + (right - left) * progress.value
        clipRect(right = reveal) {
            // area + line
            val line = Path()
            pts.forEachIndexed { i, m -> if (i == 0) line.moveTo(x(m.time), y(m.value)) else line.lineTo(x(m.time), y(m.value)) }
            val area = Path().apply {
                addPath(line)
                lineTo(x(pts.last().time), bottom); lineTo(x(pts.first().time), bottom); close()
            }
            drawPath(area, Brush.verticalGradient(listOf(C.Ph.copy(alpha = 0.22f), C.Ph.copy(alpha = 0f)), startY = top, endY = bottom))
            drawPath(line, C.Ph.copy(alpha = 0.85f), style = Stroke(2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            for (m in pts) {
                val c = Offset(x(m.time), y(m.value))
                drawCircle(C.Bg, 5.5.dp.toPx(), c)
                drawCircle(status(m.value, tMin, tMax).color(), 4.dp.toPx(), c)
            }
        }

        // tooltip
        selected?.let { m ->
            val c = Offset(x(m.time), y(m.value))
            drawLine(C.BorderStrong, Offset(c.x, top), Offset(c.x, bottom), 1.dp.toPx())
            drawCircle(C.Text, 6.dp.toPx(), c, style = Stroke(2.dp.toPx()))
            val tl = measurer.measure("pH ${fmt(m.value)}  ·  ${m.time.zoned().format(TIP_FMT)}", TextStyle(color = C.Text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold))
            val pad = 8.dp.toPx()
            val w = tl.size.width + pad * 2; val h = tl.size.height + pad * 1.4f
            val bx = (c.x - w / 2).coerceIn(left, right - w)
            val by = if (c.y - h - 10.dp.toPx() > top) c.y - h - 10.dp.toPx() else c.y + 12.dp.toPx()
            drawRoundRect(C.PanelHover, Offset(bx, by), Size(w, h), CornerRadius(10.dp.toPx()))
            drawRoundRect(C.BorderStrong, Offset(bx, by), Size(w, h), CornerRadius(10.dp.toPx()), style = Stroke(1f))
            drawText(tl, topLeft = Offset(bx + pad, by + pad * 0.7f))
        }
    }
}

/** number of measurements per 0.5 pH step, bars grow in */
@Composable
fun Histogram(data: List<Measurement>, tMin: Double, tMax: Double, animKey: Any) {
    val measurer = rememberTextMeasurer()
    val progress = remember { Animatable(0f) }
    LaunchedEffect(animKey) {
        progress.snapTo(0f)
        progress.animateTo(1f, tween(800, easing = FastOutSlowInEasing))
    }
    // bins: key = lower edge * 2 (6.0 -> 12, 6.5 -> 13)
    val bins = remember(data) {
        if (data.isEmpty()) emptyList()
        else {
            val counts = data.groupingBy { floor(it.value * 2).toInt() }.eachCount()
            (counts.keys.min()..counts.keys.max()).map { it to (counts[it] ?: 0) }
        }
    }
    val maxN = (bins.maxOfOrNull { it.second } ?: 1).coerceAtLeast(1)
    val label = TextStyle(color = C.Faint, fontSize = 10.sp)
    val count = TextStyle(color = C.Text2, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)

    Canvas(Modifier.fillMaxWidth().height(170.dp)) {
        if (bins.isEmpty()) return@Canvas
        val top = 18.dp.toPx(); val bottom = size.height - 20.dp.toPx()
        val slot = size.width / bins.size
        val bw = (slot * 0.56f).coerceAtMost(34.dp.toPx())
        drawLine(C.Border, Offset(0f, bottom), Offset(size.width, bottom), 1f)
        bins.forEachIndexed { i, (k, n) ->
            val v = k / 2.0
            val cx = slot * i + slot / 2
            val h = (bottom - top) * n / maxN * progress.value
            val col = status(v + 0.25, tMin, tMax).color()
            if (n > 0) {
                drawRoundRect(col, Offset(cx - bw / 2, bottom - h), Size(bw, h), CornerRadius(6.dp.toPx()))
                val tl = measurer.measure(n.toString(), count)
                drawText(tl, topLeft = Offset(cx - tl.size.width / 2, bottom - h - tl.size.height - 2.dp.toPx()))
            }
            val tl = measurer.measure(fmt1(v), label)
            drawText(tl, topLeft = Offset(cx - tl.size.width / 2, bottom + 5.dp.toPx()))
        }
    }
}
