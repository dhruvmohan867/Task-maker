package com.dhruv.taskmanager.service;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.Test;

import com.dhruv.taskmanager.domain.TaskPriority;
import com.dhruv.taskmanager.model.Task;

class TaskPolicyServiceTest {

    private final TaskPolicyService policy = new TaskPolicyService();

    @Test
    void transitionRules_enforced() {
        Task existing = new Task();
        existing.setStatus("OPEN");

        Task incoming = new Task();
        incoming.setStatus("DONE");
        incoming.setTitle("x");

        assertThrows(IllegalArgumentException.class, () -> policy.validateForUpdate(existing, incoming));
    }

    @Test
    void overdueEscalatesToHigh() {
        Task t = new Task();
        t.setStatus("OPEN");
        t.setPriority("LOW");
        t.setDueDate(Instant.now().minus(2, ChronoUnit.DAYS));

        TaskPriority p = policy.escalatedPriority(t, Instant.now());
        assertEquals(TaskPriority.HIGH, p);
    }
}