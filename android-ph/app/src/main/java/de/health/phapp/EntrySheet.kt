package de.health.phapp

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DATE_FMT = DateTimeFormatter.ofPattern("EE, dd.MM.yyyy", Locale.GERMANY)
private val TIME_FMT = DateTimeFormatter.ofPattern("HH:mm")

/**
 * Entry and editing of one measurement. Input only via the own keypad: one
 * comma key, at most two decimals, a missing comma is added automatically.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntrySheet(
    edit: Measurement?,
    tMin: Double,
    tMax: Double,
    onDismiss: () -> Unit,
    onSave: (time: Long, value: Double) -> Unit,
    onDelete: (() -> Unit)?,
) {
    val haptic = LocalHapticFeedback.current
    val zone = ZoneId.systemDefault()
    var text by remember { mutableStateOf(edit?.let { PhInput.text(it.value) } ?: "") }
    var dateTime by remember {
        mutableStateOf(edit?.let { LocalDateTime.ofInstant(Instant.ofEpochMilli(it.time), zone) } ?: LocalDateTime.now().withSecond(0).withNano(0))
    }
    var askDelete by remember { mutableStateOf(false) }
    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }

    val parsed = PhInput.parse(text)
    val value = parsed.value?.let { round2(it) }
    val st = value?.let { status(it, tMin, tMax) }
    val valueColor by animateColorAsState(st?.color() ?: C.Faint, label = "val")

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = C.Panel,
        contentColor = C.Text,
        dragHandle = { BottomSheetDefaults.DragHandle(color = C.BorderStrong) },
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 20.dp).navigationBarsPadding()) {
            Text(if (edit == null) "Neue Messung" else "Messung bearbeiten", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)

            // value display
            Column(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("pH ", color = C.Muted, fontSize = 20.sp, modifier = Modifier.padding(bottom = 12.dp))
                    Text(
                        if (text.isEmpty()) "–,–" else if (parsed.autoComma && value != null) fmt(value) else text,
                        color = if (text.isEmpty()) C.Faint else valueColor,
                        fontSize = 60.sp, fontWeight = FontWeight.Bold,
                    )
                }
                Box(Modifier.height(24.dp), contentAlignment = Alignment.Center) {
                    when {
                        parsed.autoComma && value != null -> Text("Komma ergänzt: „$text“ wird als ${fmt(value)} gespeichert", color = C.Accent, fontSize = 12.5.sp)
                        st != null -> StatusBadge(st)
                        text.isNotEmpty() -> Text("Kein gültiger pH-Wert (0–14)", color = C.Crit, fontSize = 12.5.sp)
                        else -> Text("Wert über die Tasten eingeben", color = C.Muted, fontSize = 12.5.sp)
                    }
                }
                AnimatedVisibility(value != null && isUnusual(value)) {
                    Text(
                        "Ungewöhnlicher Wert (üblich 4–9). Kann trotzdem gespeichert werden.",
                        color = C.Warn, fontSize = 12.5.sp, textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 6.dp).clip(RoundedCornerShape(10.dp)).background(C.Warn.copy(alpha = 0.1f)).padding(horizontal = 10.dp, vertical = 6.dp)
                    )
                }
            }

            // fine adjustment
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(-0.1, +0.1).forEach { d ->
                    OutlinedButton(
                        onClick = {
                            val base = value ?: 7.0
                            text = PhInput.text(round2((base + d).coerceIn(0.0, PhInput.MAX)))
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, C.BorderStrong),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = C.Text2),
                    ) { Text(if (d < 0) "− 0,1" else "+ 0,1", fontWeight = FontWeight.SemiBold) }
                }
            }

            // keypad
            val rows = listOf("123", "456", "789", ",0<")
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                rows.forEach { r ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        r.forEach { k ->
                            Key(k, Modifier.weight(1f), onLongPress = if (k == '<') ({ text = "" }) else null) {
                                text = PhInput.press(text, k)
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            }
                        }
                    }
                }
            }

            // date + time
            Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("📅  " + dateTime.format(DATE_FMT), Modifier.weight(1.4f)) { showDate = true }
                Chip("🕐  " + dateTime.format(TIME_FMT), Modifier.weight(1f)) { showTime = true }
            }

            Spacer(Modifier.height(16.dp))
            Button(
                onClick = { value?.let { onSave(dateTime.atZone(zone).toInstant().toEpochMilli(), it) } },
                enabled = value != null,
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = C.Ph, contentColor = C.OnPh, disabledContainerColor = C.Panel2, disabledContentColor = C.Faint),
            ) { Text("Speichern", fontSize = 16.sp, fontWeight = FontWeight.Bold) }

            if (onDelete != null) {
                TextButton(
                    onClick = { if (askDelete) onDelete() else askDelete = true },
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    colors = ButtonDefaults.textButtonColors(contentColor = C.Crit),
                ) { Text(if (askDelete) "Wirklich löschen? Nochmal tippen" else "Messung löschen", fontWeight = FontWeight.SemiBold) }
            }
        }
    }

    if (showDate) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = dateTime.toLocalDate().atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let {
                        val d = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
                        dateTime = LocalDateTime.of(d, dateTime.toLocalTime())
                    }
                    showDate = false
                }) { Text("Übernehmen") }
            },
            dismissButton = { TextButton(onClick = { showDate = false }) { Text("Abbrechen") } },
            colors = DatePickerDefaults.colors(containerColor = C.Panel),
        ) { DatePicker(state, colors = pickerColors()) }
    }

    if (showTime) {
        val state = rememberTimePickerState(dateTime.hour, dateTime.minute, is24Hour = true)
        AlertDialog(
            onDismissRequest = { showTime = false },
            containerColor = C.Panel,
            confirmButton = {
                TextButton(onClick = {
                    dateTime = LocalDateTime.of(dateTime.toLocalDate(), LocalTime.of(state.hour, state.minute))
                    showTime = false
                }) { Text("Übernehmen") }
            },
            dismissButton = { TextButton(onClick = { showTime = false }) { Text("Abbrechen") } },
            text = { TimePicker(state) },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun pickerColors() = DatePickerDefaults.colors(
    containerColor = C.Panel,
    selectedDayContainerColor = C.Ph,
    selectedDayContentColor = C.OnPh,
    todayDateBorderColor = C.Ph,
    todayContentColor = C.Ph,
)

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun Key(k: Char, modifier: Modifier, onLongPress: (() -> Unit)?, onClick: () -> Unit) {
    val special = k == ',' || k == '<'
    Box(
        modifier
            .height(58.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (special) C.Bg else C.Panel2)
            .border(1.dp, C.Border, RoundedCornerShape(14.dp))
            .combinedClickable(onClick = onClick, onLongClick = onLongPress),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            when (k) { '<' -> "⌫"; else -> k.toString() },
            color = if (k == ',') C.Ph else C.Text,
            fontSize = if (k == ',') 30.sp else 24.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun Chip(label: String, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier.clip(RoundedCornerShape(12.dp)).background(C.Panel2).border(1.dp, C.Border, RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = C.Text2, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1) }
}
