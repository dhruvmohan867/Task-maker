package com.dhruv.taskmanager.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;

import org.springframework.stereotype.Service;

import com.dhruv.taskmanager.domain.TaskPriority;
import com.dhruv.taskmanager.domain.TaskStatus;
import com.dhruv.taskmanager.model.Task;

@Service
public class TaskPolicyService {

    public Task normalize(Task t) {
        if (t == null) return null;
        if (t.getStatus() != null) t.setStatus(t.getStatus().trim().toUpperCase());
        if (t.getPriority() != null) t.setPriority(t.getPriority().trim().toUpperCase());
        if (t.getTitle() != null) t.setTitle(t.getTitle().trim());
        if (t.getAssignee() != null) t.setAssignee(t.getAssignee().trim());
        return t;
    }

    public void applyDefaults(Task t) {
        Objects.requireNonNull(t);
        if (t.getStatus() == null) t.setStatus(TaskStatus.OPEN.name());
        if (t.getPriority() == null) t.setPriority(TaskPriority.MEDIUM.name());
    }

    public void validateForCreate(Task t) {
        Objects.requireNonNull(t);
        if (t.getTitle() == null || t.getTitle().isBlank()) {
            throw new IllegalArgumentException("title is required");
        }
        validateDueDate(t.getDueDate());
        // status/priority must be valid values if present
        TaskStatus.from(t.getStatus());
        TaskPriority.from(t.getPriority());
    }

    public void validateForUpdate(Task existing, Task incoming) {
        Objects.requireNonNull(existing);
        Objects.requireNonNull(incoming);

        validateDueDate(incoming.getDueDate());

        TaskStatus from = TaskStatus.from(existing.getStatus());
        TaskStatus to = TaskStatus.from(incoming.getStatus());
        if (!validTransition(from, to)) {
            throw new IllegalArgumentException("invalid status transition " + from + " -> " + to);
        }

        // ensure enums parse (throws if invalid)
        TaskPriority.from(incoming.getPriority());
    }

    public boolean validTransition(TaskStatus from, TaskStatus to) {
        if (from == null || to == null) return false;
        if (from == to) return true;
        return (from == TaskStatus.OPEN && to == TaskStatus.IN_PROGRESS)
            || (from == TaskStatus.IN_PROGRESS && to == TaskStatus.DONE);
    }

    public void validateDueDate(Instant dueDate) {
        if (dueDate == null) return;
        Instant today = Instant.now().truncatedTo(ChronoUnit.DAYS);
        if (dueDate.isBefore(today)) {
            throw new IllegalArgumentException("due date cannot be in the past");
        }
    }

    public boolean isOverdue(Task t, Instant now) {
        if (t == null || t.getDueDate() == null) return false;
        TaskStatus st = TaskStatus.from(t.getStatus());
        return st != TaskStatus.DONE && t.getDueDate().isBefore(now);
    }

    /**
     * Escalate priority when close to deadline / overdue.
     * - < 24h to due date: LOW->MEDIUM, MEDIUM->HIGH
     * - overdue: at least HIGH
     */
    public TaskPriority escalatedPriority(Task t, Instant now) {
        if (t == null || t.getDueDate() == null) return TaskPriority.from(t.getPriority());
        TaskStatus st = TaskStatus.from(t.getStatus());
        if (st == TaskStatus.DONE) return TaskPriority.from(t.getPriority());

        TaskPriority current = TaskPriority.from(t.getPriority());
        long hoursToDue = ChronoUnit.HOURS.between(now, t.getDueDate());

        if (hoursToDue < 0) {
            return TaskPriority.max(current, TaskPriority.HIGH);
        }
        if (hoursToDue <= 24) {
            if (current == null || current == TaskPriority.LOW) return TaskPriority.MEDIUM;
            if (current == TaskPriority.MEDIUM) return TaskPriority.HIGH;
        }
        return current;
    }
}