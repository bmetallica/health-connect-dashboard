package de.health.hcbridge

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val Bg = Color(0xFF0B1020)
private val Panel = Color(0xFF131A30)
private val Accent = Color(0xFF22D3EE)
private val Ok = Color(0xFF34D399)
private val Warn = Color(0xFFFBBF24)
private val Crit = Color(0xFFF87171)
private val Muted = Color(0xFF8291A8)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Accent, background = Bg, surface = Panel, onPrimary = Color(0xFF04202A))) {
                Surface(Modifier.fillMaxSize(), color = Bg) { App() }
            }
        }
    }
}

private fun fmt(t: Long) = if (t <= 0) "nie" else SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.GERMANY).format(Date(t))

private val PKG_NAMES = mapOf(
    "nl.appyhapps.healthsync" to "Health Sync (Huawei-Band)",
    "com.sec.android.app.shealth" to "Samsung Health",
    "com.google.android.apps.fitness" to "Google Fit",
    "android" to "Android (Handy)",
    "com.huawei.health" to "Huawei Health",
)

@Composable
fun App() {
    val ctx = LocalContext.current
    val prefs = remember { Prefs(ctx) }
    val scope = rememberCoroutineScope()
    var tick by remember { mutableIntStateOf(0) }
    var granted by remember { mutableStateOf<Set<String>>(emptySet()) }
    var bgFeature by remember { mutableStateOf<Boolean?>(null) }
    val sdk = remember { HealthConnectClient.getSdkStatus(ctx) }
    val client = remember { if (sdk == HealthConnectClient.SDK_AVAILABLE) HealthConnectClient.getOrCreate(ctx) else null }

    val allPerms = remember {
        Types.ALL.map { it.permission }.toSet() + HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND + HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY
    }
    val launcher = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted = it; tick++ }

    // refresh on resume and periodically while visible
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) tick++ }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    LaunchedEffect(Unit) { while (true) { delay(4000); tick++ } }
    LaunchedEffect(tick) {
        if (client != null) {
            granted = client.permissionController.getGrantedPermissions()
            bgFeature = client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
        }
    }

    val outbox = remember { Outbox(ctx, prefs) }
    val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
    @Suppress("UNUSED_EXPRESSION") tick
    val ignoringBattery = pm.isIgnoringBatteryOptimizations(ctx.packageName)

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).windowInsetsPadding(WindowInsets.systemBars).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("HC Bridge", fontSize = 24.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(10.dp))
            val ok = prefs.lastError.isEmpty() && prefs.lastSuccess > 0
            Dot(if (ok) Ok else if (prefs.lastError.isNotEmpty()) Crit else Muted)
        }
        Text("Überträgt Health-Connect-Daten an deinen Gesundheits-Server.", color = Muted, fontSize = 13.sp)

        if (sdk != HealthConnectClient.SDK_AVAILABLE) {
            Section("Health Connect fehlt") { Text("Health Connect ist auf diesem Gerät nicht verfügbar oder muss aktualisiert werden.", color = Crit) }
        }

        // ---------- status ----------
        Section("Status") {
            Info("Letzte erfolgreiche Übertragung", fmt(prefs.lastSuccess))
            Info("Letzter Versuch", fmt(prefs.lastRun))
            Info("Warteschlange", "${outbox.size()} Pakete")
            Info("Gesendet insgesamt", "${prefs.totalRecords} Einträge")
            if (prefs.lastError.isNotEmpty()) Text("Fehler: ${prefs.lastError}", color = Crit, fontSize = 13.sp)
            Button(onClick = { Scheduler.runNow(ctx); prefs.log("Manuelle Synchronisation gestartet") }, modifier = Modifier.fillMaxWidth(), enabled = prefs.serverUrl.isNotBlank()) {
                Text("Jetzt synchronisieren")
            }
        }

        // ---------- setup ----------
        Section("Einrichtung") {
            var url by remember { mutableStateOf(prefs.serverUrl) }
            var test by remember { mutableStateOf("") }
            OutlinedTextField(
                value = url, onValueChange = { url = it }, label = { Text("Server-Adresse") },
                placeholder = { Text("http://192.168.x.x:8321/ingest") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri)
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { prefs.serverUrl = url; Scheduler.apply(ctx); tick++ }) { Text("Speichern") }
                OutlinedButton(onClick = {
                    test = "Teste …"
                    scope.launch {
                        test = withContext(Dispatchers.IO) {
                            try {
                                val health = url.trim().replace(Regex("/(ingest|api/ingest|data)?/?$"), "") + "/health"
                                val c = URL(health).openConnection() as HttpURLConnection
                                c.connectTimeout = 8000; c.readTimeout = 8000
                                val code = c.responseCode
                                c.disconnect()
                                if (code == 200) "✓ Server erreichbar" else "Server antwortet mit HTTP $code"
                            } catch (e: Exception) { "✕ Nicht erreichbar: ${e.message}" }
                        }
                    }
                }) { Text("Verbindung testen") }
            }
            if (test.isNotEmpty()) Text(test, fontSize = 13.sp, color = if (test.startsWith("✓")) Ok else if (test.startsWith("✕")) Crit else Muted)
            Spacer(Modifier.height(6.dp))
            Text("Intervall", color = Muted, fontSize = 13.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(15, 30, 60).forEach { m ->
                    FilterChip(selected = prefs.intervalMin == m, onClick = { prefs.intervalMin = m; Scheduler.apply(ctx); tick++ }, label = { Text("$m min") })
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Automatisch im Hintergrund synchronisieren", modifier = Modifier.weight(1f))
                Switch(checked = prefs.enabled, onCheckedChange = { prefs.enabled = it; Scheduler.apply(ctx); tick++ })
            }
        }

        // ---------- permissions ----------
        Section("Berechtigungen") {
            val typeGranted = Types.ALL.count { it.permission in granted }
            Check(typeGranted == Types.ALL.size, "Datentypen: $typeGranted von ${Types.ALL.size} erlaubt")
            Check(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in granted, "Lesen im Hintergrund" + if (bgFeature == false) " (von Health Connect nicht unterstützt – bitte aktualisieren)" else "")
            Check(HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY in granted, "Ältere Daten (Verlauf über 30 Tage)")
            Button(onClick = { launcher.launch(allPerms) }, modifier = Modifier.fillMaxWidth()) { Text("Berechtigungen erteilen") }
            TextButton(onClick = { open(ctx, Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS")) }) { Text("Health Connect öffnen") }
        }

        // ---------- battery (Samsung) ----------
        Section("Hintergrundbetrieb (Samsung)") {
            Check(ignoringBattery, "Akkuoptimierung deaktiviert")
            Text(
                "Damit Samsung die App nicht schlafen legt:\n" +
                    "1. Akku → App-Akkunutzung: „Nicht eingeschränkt“\n" +
                    "2. Akku → Hintergrund-Nutzungsbeschränkungen → „Nie in Standby versetzte Apps“: HC Bridge und Health Connect hinzufügen\n" +
                    "3. App-Info → „Berechtigungen entfernen, wenn App nicht verwendet wird“: aus",
                color = Muted, fontSize = 13.sp, lineHeight = 19.sp
            )
            if (!ignoringBattery) {
                Button(onClick = {
                    open(ctx, Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.packageName)))
                }, modifier = Modifier.fillMaxWidth()) { Text("Akkuoptimierung deaktivieren") }
            }
            OutlinedButton(onClick = { open(ctx, Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.packageName))) }, modifier = Modifier.fillMaxWidth()) {
                Text("App-Info öffnen (Akku, Berechtigungen)")
            }
            OutlinedButton(onClick = { openSamsungBattery(ctx) }, modifier = Modifier.fillMaxWidth()) { Text("Samsung-Akkueinstellungen öffnen") }
        }

        // ---------- data types ----------
        Section("Datentypen") {
            Types.ALL.forEach { t ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(t.label)
                        if (t.permission !in granted) Text("keine Berechtigung", color = Warn, fontSize = 12.sp)
                    }
                    Switch(checked = t.key !in prefs.disabledTypes, onCheckedChange = { on ->
                        prefs.disabledTypes = if (on) prefs.disabledTypes - t.key else prefs.disabledTypes + t.key
                        tick++
                    })
                }
            }
        }

        // ---------- sources ----------
        if (prefs.sources.isNotEmpty()) {
            Section("Datenquellen") {
                Text("Welche Apps übertragen werden (Doppelte filtert der Server).", color = Muted, fontSize = 13.sp)
                prefs.sources.sorted().forEach { pkg ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(PKG_NAMES[pkg] ?: pkg)
                            Text(pkg, color = Muted, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                        }
                        Switch(checked = pkg !in prefs.excludedSources, onCheckedChange = { on ->
                            prefs.excludedSources = if (on) prefs.excludedSources - pkg else prefs.excludedSources + pkg
                            tick++
                        })
                    }
                }
            }
        }

        // ---------- maintenance ----------
        Section("Wartung") {
            var confirm by remember { mutableStateOf(false) }
            Text("Erstbefüllung erneut starten: liest alle Daten noch einmal komplett aus Health Connect und sendet sie (der Server verwirft Doppelte).", color = Muted, fontSize = 13.sp)
            if (!confirm) OutlinedButton(onClick = { confirm = true }) { Text("Erstbefüllung neu starten") }
            else Button(onClick = { prefs.clearTokens(); prefs.log("Erstbefüllung neu gestartet"); Scheduler.runNow(ctx); confirm = false }, colors = ButtonDefaults.buttonColors(containerColor = Warn)) { Text("Ja, alles neu senden") }
        }

        // ---------- log ----------
        Section("Protokoll") {
            val lines = prefs.logLines().take(40)
            if (lines.isEmpty()) Text("Noch keine Einträge.", color = Muted, fontSize = 13.sp)
            lines.forEach { Text(it, fontSize = 11.5.sp, fontFamily = FontFamily.Monospace, color = Color(0xFFCBD5E1)) }
        }
        Spacer(Modifier.height(24.dp))
    }
}

private fun open(ctx: Context, i: Intent): Boolean = try {
    ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
} catch (e: Exception) { false }

// Samsung "Device care" battery screens differ between One UI versions
private fun openSamsungBattery(ctx: Context) {
    val candidates = listOf(
        ComponentName("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"),
        ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"),
        ComponentName("com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity"),
    )
    for (c in candidates) if (open(ctx, Intent().setComponent(c))) return
    open(ctx, Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
}

@Composable
private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Panel).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(title, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        content()
    }
}

@Composable
private fun Info(label: String, value: String) {
    Row { Text(label, color = Muted, fontSize = 13.sp, modifier = Modifier.weight(1f)); Text(value, fontSize = 13.sp) }
}

@Composable
private fun Check(ok: Boolean, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(if (ok) "✓" else "!", color = if (ok) Ok else Warn, fontWeight = FontWeight.Bold, modifier = Modifier.width(22.dp))
        Text(label, fontSize = 14.sp)
    }
}

@Composable
private fun Dot(c: Color) = Box(Modifier.size(10.dp).clip(CircleShape).background(c))
