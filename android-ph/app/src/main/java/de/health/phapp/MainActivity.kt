package de.health.phapp

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        SyncWorker.schedule(this)
        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = C.Ph, onPrimary = C.OnPh, background = C.Bg, surface = C.Panel, onSurface = C.Text,
                    surfaceContainerHigh = C.Panel, surfaceContainerHighest = C.Panel2, onSurfaceVariant = C.Muted,
                )
            ) {
                Surface(Modifier.fillMaxSize(), color = C.Bg) { App() }
            }
        }
    }
}

@Composable
fun App() {
    var screen by rememberSaveable { mutableStateOf("main") }
    BackHandler(screen == "setup") { screen = "main" }
    AnimatedContent(
        screen,
        transitionSpec = {
            val dir = if (targetState == "setup") 1 else -1
            (slideInHorizontally(tween(260)) { it / 4 * dir } + fadeIn(tween(260))) togetherWith
                (slideOutHorizontally(tween(260)) { -it / 4 * dir } + fadeOut(tween(200)))
        },
        label = "screen",
    ) { s ->
        if (s == "main") MainScreen(onSetup = { screen = "setup" }) else SetupScreen(onBack = { screen = "main" })
    }
}

private val RANGES = listOf("Woche" to 7, "Monat" to 30, "90 T" to 90, "Alles" to 0)
private val LIST_DAY = DateTimeFormatter.ofPattern("EE, dd.MM.yy", Locale.GERMANY)
private val LIST_TIME = DateTimeFormatter.ofPattern("HH:mm")
private val SYNC_FMT = DateTimeFormatter.ofPattern("dd.MM. HH:mm")

@Composable
fun MainScreen(onSetup: () -> Unit) {
    val ctx = LocalContext.current
    val store = remember { Store(ctx) }
    val prefs = remember { Prefs(ctx) }
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf(store.all()) }
    var pending by remember { mutableIntStateOf(store.pendingCount()) }
    var lastError by remember { mutableStateOf(prefs.lastError) }
    var range by remember { mutableIntStateOf(prefs.range) }
    var sheet by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Measurement?>(null) }
    val tMin = prefs.targetMin
    val tMax = prefs.targetMax

    fun reload() {
        items = store.all(); pending = store.pendingCount(); lastError = prefs.lastError
    }

    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) reload() }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    // follow the background transfer while something is waiting
    LaunchedEffect(pending) { while (pending > 0) { delay(2500); reload() } }

    // time window of the selected range
    val zone = ZoneId.systemDefault()
    val days = RANGES[range].second
    val today = LocalDate.now()
    val to = today.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
    val from = if (days > 0) today.minusDays(days - 1L).atStartOfDay(zone).toInstant().toEpochMilli()
    else (items.firstOrNull()?.time?.let { Instant.ofEpochMilli(it).atZone(zone).toLocalDate() } ?: today.minusDays(29)).atStartOfDay(zone).toInstant().toEpochMilli()
    val inRange = items.filter { it.time in from until to }
    val last = items.lastOrNull()

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = WindowInsets.systemBars.asPaddingValues().let {
            PaddingValues(start = 16.dp, end = 16.dp, top = it.calculateTopPadding() + 12.dp, bottom = it.calculateBottomPadding() + 24.dp)
        },
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // header
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("pH-Wert", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = C.Text)
                    Text("Messungen mit Teststreifen", fontSize = 13.sp, color = C.Muted)
                }
                IconButton(onClick = onSetup, modifier = Modifier.clip(CircleShape).background(C.Panel).border(1.dp, C.Border, CircleShape)) {
                    Icon(Icons.Filled.Settings, contentDescription = "Setup", tint = C.Text2)
                }
            }
        }

        // the main action, always on top
        item {
            Row(
                Modifier
                    .fillMaxWidth()
                    .shadow(18.dp, RoundedCornerShape(20.dp), ambientColor = C.Ph, spotColor = C.Ph)
                    .clip(RoundedCornerShape(20.dp))
                    .background(Brush.linearGradient(listOf(C.Ph, C.PhDark)))
                    .clickable { editing = null; sheet = true }
                    .padding(horizontal = 18.dp, vertical = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(44.dp).clip(CircleShape).background(C.OnPh.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                    Text("+", color = C.OnPh, fontSize = 30.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.width(14.dp))
                Column {
                    Text("Messung erfassen", color = C.OnPh, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    Text("Teststreifen ablesen und Wert eintragen", color = C.OnPh.copy(alpha = 0.7f), fontSize = 12.5.sp)
                }
            }
        }

        // transfer status
        item {
            val (dot, msg) = when {
                !prefs.configured -> C.Warn to "Kein Server eingerichtet – Werte bleiben nur auf dem Handy. Zum Setup →"
                pending > 0 && lastError.isNotEmpty() -> C.Crit to "$pending ${if (pending == 1) "Wert wartet" else "Werte warten"} auf Übertragung · $lastError"
                pending > 0 -> C.Accent to "$pending ${if (pending == 1) "Wert wird" else "Werte werden"} übertragen …"
                else -> C.Ok to "Alle Werte übertragen" + (if (prefs.lastSync > 0) " · " + Instant.ofEpochMilli(prefs.lastSync).atZone(zone).format(SYNC_FMT) else "")
            }
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable {
                    if (!prefs.configured) onSetup() else scope.launch { Server.push(ctx); reload() }
                }.padding(horizontal = 4.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Dot(dot)
                Spacer(Modifier.width(8.dp))
                Text(msg, color = C.Muted, fontSize = 12.5.sp)
            }
        }

        if (items.isEmpty()) {
            item {
                Panel(title = "Noch keine Messungen", subtitle = "Erfasse deinen ersten Wert oben über „Messung erfassen“.") {
                    if (prefs.webConfigured) {
                        Text("Bereits gemessene Werte lassen sich im Setup vom Server übernehmen.", color = C.Muted, fontSize = 13.sp)
                        Spacer(Modifier.height(10.dp))
                        OutlinedButton(onClick = onSetup, shape = RoundedCornerShape(12.dp)) { Text("Zum Setup", color = C.Text2) }
                    }
                }
            }
            return@LazyColumn
        }

        // summary
        item {
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val st = last?.let { status(it.value, tMin, tMax) }
                    Column(Modifier.weight(1f)) {
                        Text("LETZTE MESSUNG", color = C.Muted, fontSize = 10.5.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)
                        Text(last?.let { fmt(it.value) } ?: "–", color = st?.color() ?: C.Text, fontSize = 40.sp, fontWeight = FontWeight.Bold)
                        Text(last?.let { Instant.ofEpochMilli(it.time).atZone(zone).format(DateTimeFormatter.ofPattern("EE, dd.MM. HH:mm", Locale.GERMANY)) } ?: "", color = C.Muted, fontSize = 12.sp)
                    }
                    if (st != null) StatusBadge(st)
                }
                Spacer(Modifier.height(14.dp))
                HorizontalDivider(color = C.Border)
                Spacer(Modifier.height(14.dp))
                val vals = inRange.map { it.value }.sorted()
                val avg = vals.takeIf { it.isNotEmpty() }?.average()
                val median = vals.takeIf { it.isNotEmpty() }?.let { if (it.size % 2 == 1) it[it.size / 2] else (it[it.size / 2 - 1] + it[it.size / 2]) / 2 }
                val inTarget = vals.takeIf { it.isNotEmpty() }?.let { v -> v.count { it in tMin..tMax } * 100 / v.size }
                Row {
                    StatBlock("Ø / Median", if (avg != null) "${fmt(round2(avg))} / ${fmt(round2(median!!))}" else "–", Modifier.weight(1f))
                    StatBlock("Spanne", if (vals.isNotEmpty()) "${fmt(vals.first())} – ${fmt(vals.last())}" else "–", Modifier.weight(1f))
                }
                Spacer(Modifier.height(12.dp))
                Row {
                    StatBlock("Im Zielbereich", inTarget?.let { "$it %" } ?: "–", Modifier.weight(1f), color = inTarget?.let { if (it >= 60) C.Ok else if (it >= 30) C.Warn else C.Crit } ?: C.Text, sub = "Ziel ${fmt(tMin)}–${fmt(tMax)}")
                    StatBlock("Messungen", vals.size.toString(), Modifier.weight(1f), sub = RANGES[range].first.let { if (it == "Alles") "insgesamt" else "im Zeitraum" })
                }
            }
        }

        item { Segmented(RANGES.map { it.first }, range, { range = it; prefs.range = it }, Modifier.fillMaxWidth()) }

        item {
            Panel(title = "Verlauf", subtitle = "Punkte nach Abstand zum Zielbereich gefärbt · antippen für Details") {
                if (inRange.isEmpty()) Text("Keine Messungen in diesem Zeitraum.", color = C.Muted, fontSize = 13.sp)
                else LineChart(inRange, from, to, tMin, tMax, animKey = range to items.size)
            }
        }

        item {
            Panel(title = "Verteilung der Werte", subtitle = "Anzahl Messungen je 0,5 pH-Stufe") {
                if (inRange.isEmpty()) Text("Keine Messungen in diesem Zeitraum.", color = C.Muted, fontSize = 13.sp)
                else Histogram(inRange, tMin, tMax, animKey = range to items.size)
            }
        }

        item {
            Panel(title = "Messungen", subtitle = "${inRange.size} im Zeitraum · antippen zum Bearbeiten") {}
        }
        items(inRange.reversed(), key = { it.id }) { m ->
            val st = status(m.value, tMin, tMax)
            val dev = deviation(m.value, tMin, tMax)
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(C.Panel)
                    .border(1.dp, C.Border, RoundedCornerShape(14.dp))
                    .clickable { editing = m; sheet = true }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    val z = Instant.ofEpochMilli(m.time).atZone(zone)
                    Text(z.format(LIST_DAY), color = C.Text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Text(z.format(LIST_TIME) + if (!m.synced) "  ·  ⏳ nicht übertragen" else "", color = if (m.synced) C.Muted else C.Accent, fontSize = 12.sp)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(fmt(m.value), color = C.Text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text(if (dev == 0.0) "✓" else (if (dev > 0) "+" else "") + fmt1(dev), color = C.Muted, fontSize = 11.5.sp)
                }
                Spacer(Modifier.width(12.dp))
                Box(Modifier.width(78.dp), contentAlignment = Alignment.CenterEnd) { StatusBadge(st) }
            }
        }
    }

    if (sheet) {
        val e = editing
        EntrySheet(
            edit = e,
            tMin = tMin,
            tMax = tMax,
            onDismiss = { sheet = false },
            onSave = { time, value ->
                if (e == null) {
                    store.add(time, value)
                } else {
                    if (time != e.time) scope.launch { runCatching { Server.deleteRemote(prefs, e.time) } }
                    store.update(e.id, time, value)
                }
                SyncWorker.schedule(ctx)
                sheet = false
                reload()
                Toast.makeText(ctx, "pH ${fmt(value)} gespeichert", Toast.LENGTH_SHORT).show()
            },
            onDelete = e?.let {
                {
                    store.delete(it.id)
                    sheet = false
                    reload()
                    if (it.synced && prefs.webConfigured) scope.launch {
                        val ok = runCatching { Server.deleteRemote(prefs, it.time) }.getOrDefault(false)
                        Toast.makeText(ctx, if (ok) "Gelöscht, auch auf dem Server" else "Auf dem Handy gelöscht. Server nicht erreichbar (nur im Heimnetz) – dort bitte im Webinterface löschen.", Toast.LENGTH_LONG).show()
                    } else Toast.makeText(ctx, if (it.synced) "Auf dem Handy gelöscht. Auf dem Server bitte im Webinterface löschen." else "Gelöscht", Toast.LENGTH_LONG).show()
                }
            },
        )
    }
}
