package de.health.hcbridge

import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.Metadata
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneOffset
import kotlin.reflect.KClass

/** One Health Connect record type the bridge can transfer. */
data class TypeDef(val key: String, val recordType: String, val label: String, val cls: KClass<out Record>) {
    val permission: String get() = HealthPermission.getReadPermission(cls)
}

object Types {
    val ALL = listOf(
        TypeDef("steps", "StepsRecord", "Schritte", StepsRecord::class),
        TypeDef("hr", "HeartRateRecord", "Herzfrequenz", HeartRateRecord::class),
        TypeDef("sleep", "SleepSessionRecord", "Schlaf", SleepSessionRecord::class),
        TypeDef("spo2", "OxygenSaturationRecord", "Sauerstoffsättigung", OxygenSaturationRecord::class),
        TypeDef("resting", "RestingHeartRateRecord", "Ruhepuls", RestingHeartRateRecord::class),
        TypeDef("hrv", "HeartRateVariabilityRmssdRecord", "Herzfrequenzvariabilität", HeartRateVariabilityRmssdRecord::class),
        TypeDef("weight", "WeightRecord", "Gewicht", WeightRecord::class),
        TypeDef("bodyfat", "BodyFatRecord", "Körperfett", BodyFatRecord::class),
        TypeDef("height", "HeightRecord", "Größe", HeightRecord::class),
        TypeDef("temp", "BodyTemperatureRecord", "Körpertemperatur", BodyTemperatureRecord::class),
        TypeDef("resp", "RespiratoryRateRecord", "Atemfrequenz", RespiratoryRateRecord::class),
        TypeDef("vo2", "Vo2MaxRecord", "VO₂max", Vo2MaxRecord::class),
        TypeDef("bp", "BloodPressureRecord", "Blutdruck", BloodPressureRecord::class),
        TypeDef("glucose", "BloodGlucoseRecord", "Blutzucker", BloodGlucoseRecord::class),
        TypeDef("distance", "DistanceRecord", "Distanz", DistanceRecord::class),
        TypeDef("active_kcal", "ActiveCaloriesBurnedRecord", "Aktive Kalorien", ActiveCaloriesBurnedRecord::class),
        TypeDef("total_kcal", "TotalCaloriesBurnedRecord", "Gesamtkalorien", TotalCaloriesBurnedRecord::class),
        TypeDef("floors", "FloorsClimbedRecord", "Stockwerke", FloorsClimbedRecord::class),
        TypeDef("hydration", "HydrationRecord", "Trinkmenge", HydrationRecord::class),
        TypeDef("exercise", "ExerciseSessionRecord", "Training", ExerciseSessionRecord::class),
    )
    fun byKey(k: String) = ALL.firstOrNull { it.key == k }
}

/**
 * Record -> JSON in the same shape the server already receives from Tasker
 * (Health Connect field names, epoch milliseconds, unit objects with getters).
 */
object Json {
    private fun ms(i: Instant) = i.toEpochMilli()
    private fun off(o: ZoneOffset?) = o?.id ?: JSONObject.NULL

    private fun meta(m: Metadata): JSONObject = JSONObject().apply {
        put("id", m.id)
        put("dataOrigin", JSONObject().put("packageName", m.dataOrigin.packageName))
        put("lastModifiedTime", ms(m.lastModifiedTime))
        put("clientRecordId", m.clientRecordId ?: JSONObject.NULL)
        put("clientRecordVersion", m.clientRecordVersion)
        put("recordingMethod", m.recordingMethod)
        val d = m.device
        put("device", if (d == null) JSONObject.NULL else JSONObject().put("manufacturer", d.manufacturer ?: JSONObject.NULL).put("model", d.model ?: JSONObject.NULL).put("type", d.type))
    }

    fun record(r: Record): JSONObject {
        val o = JSONObject()
        o.put("metadata", meta(r.metadata))
        // time fields (the common record interfaces are internal in the library)
        fun at(t: Instant, z: ZoneOffset?) { o.put("time", ms(t)); o.put("zoneOffset", off(z)) }
        fun span(a: Instant, b: Instant, za: ZoneOffset?, zb: ZoneOffset?) {
            o.put("startTime", ms(a)); o.put("endTime", ms(b)); o.put("startZoneOffset", off(za)); o.put("endZoneOffset", off(zb))
        }
        when (r) {
            is StepsRecord -> {
                span(r.startTime, r.endTime, r.startZoneOffset, r.endZoneOffset)
                o.put("count", r.count)
            }
            is HeartRateRecord -> {
                span(r.startTime, r.endTime, r.startZoneOffset, r.endZoneOffset)
                o.put("samples", JSONArray().apply {
                    r.samples.forEach { put(JSONObject().put("time", ms(it.time)).put("beatsPerMinute", it.beatsPerMinute)) }
                })
            }
            is SleepSessionRecord -> {
                span(r.startTime, r.endTime, r.startZoneOffset, r.endZoneOffset)
                o.put("title", r.title ?: JSONObject.NULL); o.put("notes", r.notes ?: JSONObject.NULL)
                o.put("stages", JSONArray().apply {
                    r.stages.forEach { put(JSONObject().put("startTime", ms(it.startTime)).put("endTime", ms(it.endTime)).put("stage", it.stage)) }
                })
            }
            is OxygenSaturationRecord -> {
                at(r.time, r.zoneOffset)
                o.put("percentage", JSONObject().put("value", r.percentage.value))
            }
            is RestingHeartRateRecord -> {
                at(r.time, r.zoneOffset)
                o.put("beatsPerMinute", r.beatsPerMinute)
            }
            is HeartRateVariabilityRmssdRecord -> {
                at(r.time, r.zoneOffset)
                o.put("heartRateVariabilityMillis", r.heartRateVariabilityMillis)
            }
            is WeightRecord -> {
                at(r.time, r.zoneOffset)
                o.put("weight", JSONObject().put("inKilograms", r.weight.inKilograms))
            }
            is BodyFatRecord -> {
                at(r.time, r.zoneOffset)
                o.put("percentage", JSONObject().put("value", r.percentage.value))
            }
            is HeightRecord -> {
                at(r.time, r.zoneOffset)
                o.put("height", JSONObject().put("inMeters", r.height.inMeters))
            }
            is BodyTemperatureRecord -> {
                at(r.time, r.zoneOffset)
                o.put("temperature", JSONObject().put("inCelsius", r.temperature.inCelsius))
            }
            is RespiratoryRateRecord -> {
                at(r.time, r.zoneOffset)
                o.put("rate", r.rate)
            }
            is Vo2MaxRecord -> {
                at(r.time, r.zoneOffset)
                o.put("vo2MillilitersPerMinuteKilogram", r.vo2MillilitersPerMinuteKilogram)
            }
            is BloodPressureRecord -> {
                at(r.time, r.zoneOffset)
                o.put("systolic", JSONObject().put("inMillimetersOfMercury", r.systolic.inMillimetersOfMercury))
                o.put("diastolic", JSONObject().put("inMillimetersOfMercury", r.diastolic.inMillimetersOfMercury))
            }
            is BloodGlucoseRecord -> {
                at(r.time, r.zoneOffset)
                o.put("level", JSONObject().put("inMilligramsPerDeciliter", r.level.inMilligramsPerDeciliter))
            }
            is DistanceRecord -> {
                span(r.startTime, r.endTime, r.startZoneOffset, r.endZoneOffset)
                o.put("distance", JSONObject().put("inMeters", r.distance.inMeters))
            }
            is ActiveCaloriesBurnedRecord -> {
                span(r.startTime, r.endTime, r.startZoneOffset, r.endZoneOffset)
                o.put("energy", JSONObject().put("inKilocalories", r.energy.inKilocalories))
            }
            is TotalCaloriesBurnedRecord -> {
                span(r.startTime, r.endTime, r.startZoneOffset, r.endZoneOffset)
                o.put("energy", JSONObject().put("inKilocalories", r.energy.inKilocalories))
            }
            is FloorsClimbedRecord -> {
                span(r.startTime, r.endTime, r.startZoneOffset, r.endZoneOffset)
                o.put("floors", r.floors)
            }
            is HydrationRecord -> {
                span(r.startTime, r.endTime, r.startZoneOffset, r.endZoneOffset)
                o.put("volume", JSONObject().put("inLiters", r.volume.inLiters))
            }
            is ExerciseSessionRecord -> {
                span(r.startTime, r.endTime, r.startZoneOffset, r.endZoneOffset)
                o.put("exerciseType", r.exerciseType)
                o.put("title", r.title ?: JSONObject.NULL); o.put("notes", r.notes ?: JSONObject.NULL)
            }
            else -> {}
        }
        return o
    }

    /** payload: [{record_type, data: {records: [...]}}] */
    fun payload(byType: Map<TypeDef, List<Record>>): JSONArray = JSONArray().apply {
        byType.forEach { (t, recs) ->
            if (recs.isNotEmpty()) put(JSONObject().put("record_type", t.recordType).put("data", JSONObject().put("records", JSONArray().apply { recs.forEach { put(record(it)) } })))
        }
    }
}
