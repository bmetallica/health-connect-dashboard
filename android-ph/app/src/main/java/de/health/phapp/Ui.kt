package de.health.phapp

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// same palette as the web interface (web/src/app.css, web/src/lib/theme.js)
object C {
    val Bg = Color(0xFF0B1020)
    val Panel = Color(0xFF131A30)
    val Panel2 = Color(0xFF182039)
    val PanelHover = Color(0xFF1C2542)
    val Border = Color(0x1F94A3B8)
    val BorderStrong = Color(0x3894A3B8)
    val Text = Color(0xFFE2E8F0)
    val Text2 = Color(0xFFCBD5E1)
    val Muted = Color(0xFF8291A8)
    val Faint = Color(0xFF56637A)
    val Accent = Color(0xFF22D3EE)
    val Ok = Color(0xFF34D399)
    val Warn = Color(0xFFFBBF24)
    val Crit = Color(0xFFF87171)
    val Ph = Color(0xFFFACC15)
    val PhDark = Color(0xFFEAB308)
    val OnPh = Color(0xFF1A1400)
}

fun Status.color() = when (this) {
    Status.OK -> C.Ok
    Status.WARN -> C.Warn
    Status.CRIT -> C.Crit
}

val CardShape = RoundedCornerShape(18.dp)

/** card with a thin colored top edge, like the cards in the web interface */
@Composable
fun Panel(
    modifier: Modifier = Modifier,
    title: String? = null,
    subtitle: String? = null,
    accent: Color = C.Ph,
    action: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(CardShape)
            .background(Brush.verticalGradient(listOf(C.Panel2, C.Panel)))
            .border(1.dp, C.Border, CardShape)
            .drawBehind {
                drawRect(Brush.horizontalGradient(listOf(accent.copy(alpha = 0f), accent, accent.copy(alpha = 0f))), size = size.copy(height = 2.dp.toPx()))
            }
            .padding(16.dp)
    ) {
        if (title != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(title, color = C.Text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                    if (subtitle != null) Text(subtitle, color = C.Muted, fontSize = 12.5.sp)
                }
                action?.invoke()
            }
            Spacer(Modifier.height(12.dp))
        }
        content()
    }
}

@Composable
fun StatusBadge(s: Status) {
    val c = s.color()
    Text(
        "${s.icon} ${s.label}",
        color = c,
        fontSize = 11.5.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(c.copy(alpha = 0.14f)).padding(horizontal = 8.dp, vertical = 3.dp)
    )
}

@Composable
fun StatBlock(label: String, value: String, modifier: Modifier = Modifier, color: Color = C.Text, sub: String? = null) {
    Column(modifier) {
        Text(label.uppercase(), color = C.Muted, fontSize = 10.5.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)
        Text(value, color = color, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        if (sub != null) Text(sub, color = C.Muted, fontSize = 11.5.sp)
    }
}

/** segmented control (Woche / Monat / …) */
@Composable
fun Segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(14.dp)).background(C.Panel).border(1.dp, C.Border, RoundedCornerShape(14.dp)).padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        options.forEachIndexed { i, o ->
            val bg by animateColorAsState(if (i == selected) C.PanelHover else Color.Transparent, label = "seg")
            Box(
                Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(bg).clickable { onSelect(i) }.padding(vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(o, color = if (i == selected) C.Text else C.Muted, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            }
        }
    }
}

@Composable
fun Dot(color: Color, size: Int = 8) {
    Box(Modifier.size(size.dp).clip(RoundedCornerShape(50)).background(color))
}

fun Offset.dist2(o: Offset) = (x - o.x) * (x - o.x) + (y - o.y) * (y - o.y)
