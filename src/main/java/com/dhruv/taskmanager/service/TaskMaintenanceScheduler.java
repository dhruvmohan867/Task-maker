package com.dhruv.taskmanager.service;

import java.time.Instant;
import java.util.List;

import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.dhruv.taskmanager.domain.TaskPriority;
import com.dhruv.taskmanager.model.Task;

@Component
public class TaskMaintenanceScheduler {

    private final TaskService repoService;
    private final TaskPolicyService policy;
    private final AnalyticsCacheService cache;

    public TaskMaintenanceScheduler(TaskService repoService, TaskPolicyService policy, AnalyticsCacheService cache) {
        this.repoService = repoService;
        this.policy = policy;
        this.cache = cache;
    }

    @Async
    @Scheduled(fixedDelayString = "${app.jobs.maintenance-ms:600000}") // default 10 min
    public void run() {
        Instant now = Instant.now();
        List<Task> all = repoService.all();

        boolean changed = false;
        for (Task t : all) {
            TaskPriority newP = policy.escalatedPriority(t, now);
            TaskPriority curP = TaskPriority.from(t.getPriority());
            if (newP != null && curP != null && newP.ordinal() > curP.ordinal()) {
                t.setPriority(newP.name());
                t.setUpdatedAt(Instant.now());
                repoService.save(t);
                changed = true;
            }
        }

        // refresh caches (simple invalidation)
        if (changed) cache.clear();
    }
}