package de.health.phapp

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Separate setup menu: server connection, target range, data transfer. */
@Composable
fun SetupScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val prefs = remember { Prefs(ctx) }
    val store = remember { Store(ctx) }
    val scope = rememberCoroutineScope()

    var host by remember { mutableStateOf(prefs.host) }
    var ingestPort by remember { mutableStateOf(prefs.ingestPort.toString()) }
    var webPort by remember { mutableStateOf(prefs.webPort.toString()) }
    var check by remember { mutableStateOf<Server.Check?>(null) }
    var checking by remember { mutableStateOf(false) }

    var tMin by remember { mutableStateOf(fmt(prefs.targetMin)) }
    var tMax by remember { mutableStateOf(fmt(prefs.targetMax)) }
    var targetMsg by remember { mutableStateOf<Pair<Color, String>?>(null) }

    var dataMsg by remember { mutableStateOf<Pair<Color, String>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var counts by remember { mutableStateOf(store.all().size to store.pendingCount()) }

    fun saveTarget(minS: String, maxS: String) {
        val a = parseNumber(minS); val b = parseNumber(maxS)
        targetMsg = when {
            a == null || b == null -> C.Crit to "Bitte zwei Zahlen eingeben, z. B. 7,0 und 7,2"
            a !in 0.0..14.0 || b !in 0.0..14.0 -> C.Crit to "Werte müssen zwischen 0 und 14 liegen"
            a > b -> C.Crit to "Der untere Wert ist größer als der obere"
            else -> { prefs.targetMin = round2(a); prefs.targetMax = round2(b); null }
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).windowInsetsPadding(WindowInsets.systemBars).imePadding().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack, modifier = Modifier.clip(CircleShape).background(C.Panel).border(1.dp, C.Border, CircleShape)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück", tint = C.Text2)
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text("Setup", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = C.Text)
                Text("Serververbindung und Zielbereich", fontSize = 13.sp, color = C.Muted)
            }
        }

        Panel(title = "Serververbindung", subtitle = "Dein Gesundheits-Server im Heimnetz", accent = C.Accent) {
            Field("Server-Adresse (IP oder Hostname)", host, "192.168.1.10", KeyboardType.Uri) {
                host = it; prefs.host = it; check = null
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Field("Port Datenempfang", ingestPort, "8321", KeyboardType.Number, Modifier.weight(1f)) {
                    ingestPort = it.filter(Char::isDigit).take(5); ingestPort.toIntOrNull()?.let { p -> prefs.ingestPort = p }; check = null
                }
                Field("Port Webinterface", webPort, "8322", KeyboardType.Number, Modifier.weight(1f)) {
                    webPort = it.filter(Char::isDigit).take(5); webPort.toIntOrNull()?.let { p -> prefs.webPort = p }; check = null
                }
            }
            if (prefs.configured) {
                Spacer(Modifier.height(8.dp))
                Text("Messungen gehen an ${prefs.ingestUrl}", color = C.Faint, fontSize = 11.5.sp, fontFamily = FontFamily.Monospace)
            }
            Spacer(Modifier.height(12.dp))
            ActionButton(if (checking) "Teste …" else "Verbindung testen", enabled = prefs.configured && !checking) {
                checking = true
                scope.launch { check = Server.test(prefs); checking = false }
            }
            check?.let { c ->
                Spacer(Modifier.height(10.dp))
                CheckLine("Datenempfang (Port ${prefs.ingestPort})", c.ingest)
                CheckLine("Webinterface (Port ${prefs.webPort})", c.web)
                if (c.ingest == null) Text("Das Webinterface wird nur für Import, Zielbereich und Löschen gebraucht.", color = C.Faint, fontSize = 11.5.sp, modifier = Modifier.padding(top = 4.dp))
            }
        }

        Panel(title = "Zielbereich", subtitle = "Werte in diesem Bereich gelten als gut", accent = C.Ok) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Field("von", tMin, "7,0", KeyboardType.Decimal, Modifier.weight(1f)) { tMin = it; saveTarget(it, tMax) }
                Field("bis", tMax, "7,2", KeyboardType.Decimal, Modifier.weight(1f)) { tMax = it; saveTarget(tMin, it) }
            }
            Text("Komma oder Punkt – beides funktioniert.", color = C.Faint, fontSize = 11.5.sp, modifier = Modifier.padding(top = 6.dp))
            targetMsg?.let { Text(it.second, color = it.first, fontSize = 12.5.sp, modifier = Modifier.padding(top = 6.dp)) }
            Spacer(Modifier.height(12.dp))
            ActionButton("Vom Webinterface übernehmen", enabled = prefs.configured && !busy) {
                busy = true
                scope.launch {
                    targetMsg = try {
                        val t = Server.fetchTarget(prefs)
                        if (t == null) C.Warn to "Im Webinterface ist kein Zielbereich hinterlegt."
                        else {
                            prefs.targetMin = t.first; prefs.targetMax = t.second
                            tMin = fmt(t.first); tMax = fmt(t.second)
                            C.Ok to "Übernommen: ${fmt(t.first)} – ${fmt(t.second)}"
                        }
                    } catch (e: Exception) {
                        C.Crit to "Fehler: ${e.message ?: e.javaClass.simpleName}"
                    }
                    busy = false
                }
            }
        }

        Panel(title = "Daten", subtitle = "Alle Werte werden zusätzlich auf dem Handy gespeichert", accent = C.Ph) {
            InfoLine("Auf dem Handy", "${counts.first} Messungen")
            InfoLine("Nicht übertragen", counts.second.toString())
            InfoLine("Letzte Übertragung", if (prefs.lastSync > 0) Instant.ofEpochMilli(prefs.lastSync).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")) else "nie")
            if (prefs.lastError.isNotEmpty()) Text("Letzter Fehler: ${prefs.lastError}", color = C.Crit, fontSize = 12.5.sp, modifier = Modifier.padding(top = 4.dp))
            dataMsg?.let { Text(it.second, color = it.first, fontSize = 12.5.sp, modifier = Modifier.padding(top = 8.dp)) }
            Spacer(Modifier.height(12.dp))
            ActionButton("Jetzt übertragen", enabled = prefs.configured && !busy) {
                busy = true
                scope.launch {
                    val err = Server.push(ctx)
                    dataMsg = if (err == null) C.Ok to "Alle Werte übertragen." else C.Crit to "Fehler: $err"
                    counts = store.all().size to store.pendingCount()
                    busy = false
                }
            }
            Spacer(Modifier.height(8.dp))
            ActionButton("Messungen vom Server importieren", enabled = prefs.configured && !busy) {
                busy = true
                scope.launch {
                    dataMsg = try {
                        val n = Server.importAll(ctx)
                        C.Ok to if (n == 0) "Keine neuen Messungen auf dem Server." else "$n Messungen übernommen."
                    } catch (e: Exception) {
                        C.Crit to "Fehler: ${e.message ?: e.javaClass.simpleName}"
                    }
                    counts = store.all().size to store.pendingCount()
                    busy = false
                }
            }
            Text("Übernimmt die im Webinterface gespeicherten Werte inklusive Korrekturen. Nicht übertragene Änderungen auf dem Handy bleiben erhalten.", color = C.Faint, fontSize = 11.5.sp, modifier = Modifier.padding(top = 6.dp))
        }

        val version = remember { runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "" }
        Text("pH-Wert $version · Teil von Health Connect Dashboard", color = C.Faint, fontSize = 11.5.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
    }
}

@Composable
private fun Field(label: String, value: String, placeholder: String, type: KeyboardType, modifier: Modifier = Modifier.fillMaxWidth(), onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        placeholder = { Text(placeholder, color = C.Faint) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = type),
        shape = RoundedCornerShape(12.dp),
        modifier = modifier,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = C.Ph, unfocusedBorderColor = C.BorderStrong,
            focusedTextColor = C.Text, unfocusedTextColor = C.Text, cursorColor = C.Ph,
            focusedLabelColor = C.Ph, unfocusedLabelColor = C.Muted,
            focusedContainerColor = C.Bg, unfocusedContainerColor = C.Bg,
        ),
    )
}

@Composable
private fun ActionButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().height(46.dp),
        shape = RoundedCornerShape(12.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (enabled) C.BorderStrong else C.Border),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = C.Text, containerColor = C.Panel2, disabledContentColor = C.Faint),
    ) { Text(label, fontWeight = FontWeight.SemiBold) }
}

@Composable
private fun CheckLine(label: String, error: String?) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Dot(if (error == null) C.Ok else C.Crit)
        Spacer(Modifier.width(8.dp))
        Text(label, color = C.Text2, fontSize = 13.sp, modifier = Modifier.weight(1f))
        Text(if (error == null) "erreichbar" else error, color = if (error == null) C.Ok else C.Crit, fontSize = 12.5.sp)
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text(label, color = C.Muted, fontSize = 13.sp, modifier = Modifier.weight(1f))
        Text(value, color = C.Text, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}
