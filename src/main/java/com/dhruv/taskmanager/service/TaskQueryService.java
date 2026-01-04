package com.dhruv.taskmanager.service;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Service;

import com.dhruv.taskmanager.model.Task;

@Service
public class TaskQueryService {

    private final TaskService repoService;
    private final TaskPolicyService policy;

    public TaskQueryService(TaskService repoService, TaskPolicyService policy) {
        this.repoService = repoService;
        this.policy = policy;
    }

    public List<Task> list(String principalName, boolean isAdmin) {
        Objects.requireNonNull(principalName, "principal required");
        return isAdmin ? repoService.all() : repoService.byOwner(principalName);
    }

    public Task get(String id, String principalName, boolean isAdmin) {
        Objects.requireNonNull(principalName, "principal required");
        Task t = repoService.get(id);
        if (t == null) return null;
        if (!isAdmin && !principalName.equals(t.getOwner())) {
            throw new SecurityException("forbidden");
        }
        return t;
    }

    public List<Task> overdue(String principalName, boolean isAdmin) {
        Instant now = Instant.now();
        return list(principalName, isAdmin).stream()
            .filter(t -> policy.isOverdue(t, now))
            .toList();
    }
}