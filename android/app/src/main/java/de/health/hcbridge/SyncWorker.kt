package de.health.hcbridge

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        prefs.lastRun = System.currentTimeMillis()
        return try {
            val s = SyncEngine(applicationContext).run()
            prefs.lastSuccess = System.currentTimeMillis()
            prefs.totalRecords = prefs.totalRecords + s.sent
            prefs.lastError = ""
            if (s.read > 0 || s.sent > 0) prefs.log("Sync: ${s.read} gelesen, ${s.sent} gesendet")
            Result.success()
        } catch (e: Exception) {
            val msg = e.message ?: e.javaClass.simpleName
            prefs.lastError = msg
            prefs.log("Fehler: $msg")
            // data stays in the outbox; WorkManager retries with backoff
            if (runAttemptCount < 5) Result.retry() else Result.success()
        }
    }
}

object Scheduler {
    private const val PERIODIC = "hc-sync"
    private const val ONCE = "hc-sync-now"

    fun apply(ctx: Context) {
        val prefs = Prefs(ctx)
        val wm = WorkManager.getInstance(ctx)
        if (!prefs.enabled || prefs.serverUrl.isBlank()) {
            wm.cancelUniqueWork(PERIODIC)
            return
        }
        val req = PeriodicWorkRequestBuilder<SyncWorker>(prefs.intervalMin.toLong().coerceAtLeast(15), TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .build()
        wm.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, req)
    }

    fun runNow(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(ONCE, ExistingWorkPolicy.REPLACE, req)
    }
}
