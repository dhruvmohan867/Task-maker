package com.dhruv.taskmanager.service;

import java.time.Instant;
import java.util.Objects;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import com.dhruv.taskmanager.events.TaskCreatedEvent;
import com.dhruv.taskmanager.events.TaskDeletedEvent;
import com.dhruv.taskmanager.events.TaskUpdatedEvent;
import com.dhruv.taskmanager.model.Task;

@Service
public class TaskCommandService {

    private final TaskService repoService;
    private final TaskPolicyService policy;
    private final ApplicationEventPublisher events;

    public TaskCommandService(TaskService repoService, TaskPolicyService policy, ApplicationEventPublisher events) {
        this.repoService = repoService;
        this.policy = policy;
        this.events = events;
    }

    public Task create(Task incoming, String principalName) {
        Objects.requireNonNull(principalName, "principal required");
        Task t = policy.normalize(incoming);
        t.setId(null);
        t.setOwner(principalName);

        policy.applyDefaults(t);
        policy.validateForCreate(t);

        Instant now = Instant.now();
        t.setCreatedAt(now);
        t.setUpdatedAt(now);

        Task saved = repoService.save(t);
        events.publishEvent(new TaskCreatedEvent(saved.getId(), principalName));
        return saved;
    }

    public Task update(String id, Task incoming, String principalName, boolean isAdmin) {
        Objects.requireNonNull(principalName, "principal required");
        Task existing = repoService.get(id);
        if (existing == null) return null;

        if (!isAdmin && !principalName.equals(existing.getOwner())) {
            throw new SecurityException("forbidden");
        }

        Task t = policy.normalize(incoming);
        t.setId(id);

        // non-admin cannot change owner
        if (!isAdmin) t.setOwner(principalName);

        policy.applyDefaults(t);
        policy.validateForUpdate(existing, t);

        // keep timestamps
        if (existing.getCreatedAt() != null) t.setCreatedAt(existing.getCreatedAt());
        t.setUpdatedAt(Instant.now());

        Task saved = repoService.save(t);
        events.publishEvent(new TaskUpdatedEvent(saved.getId(), principalName, existing.getStatus(), saved.getStatus()));
        return saved;
    }

    public void delete(String id, String principalName, boolean isAdmin) {
        if (!isAdmin) throw new SecurityException("admin only");
        repoService.delete(id);
        events.publishEvent(new TaskDeletedEvent(id, principalName));
    }
}