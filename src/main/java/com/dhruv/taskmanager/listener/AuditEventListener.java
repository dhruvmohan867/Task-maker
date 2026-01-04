package com.dhruv.taskmanager.listener;

import java.time.Instant;

import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import com.dhruv.taskmanager.events.TaskCreatedEvent;
import com.dhruv.taskmanager.events.TaskDeletedEvent;
import com.dhruv.taskmanager.events.TaskUpdatedEvent;
import com.dhruv.taskmanager.model.AuditEvent;
import com.dhruv.taskmanager.repository.AuditEventRepository;

@Component
public class AuditEventListener {

    private final AuditEventRepository repo;

    public AuditEventListener(AuditEventRepository repo) {
        this.repo = repo;
    }

    @Async
    @EventListener
    public void onCreated(TaskCreatedEvent e) {
        save("TASK_CREATED", e.actor(), e.taskId(), "created");
    }

    @Async
    @EventListener
    public void onUpdated(TaskUpdatedEvent e) {
        save("TASK_UPDATED", e.actor(), e.taskId(), e.fromStatus() + " -> " + e.toStatus());
    }

    @Async
    @EventListener
    public void onDeleted(TaskDeletedEvent e) {
        save("TASK_DELETED", e.actor(), e.taskId(), "deleted");
    }

    private void save(String type, String actor, String taskId, String details) {
        AuditEvent a = new AuditEvent();
        a.setAt(Instant.now());
        a.setType(type);
        a.setActor(actor);
        a.setTaskId(taskId);
        a.setDetails(details);
        repo.save(a);
    }
}