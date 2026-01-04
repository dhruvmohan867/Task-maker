package com.dhruv.taskmanager.events;

import java.util.Objects;

public record TaskUpdatedEvent(String taskId, String actor, String fromStatus, String toStatus) {
    public TaskUpdatedEvent {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(actor, "actor");
        Objects.requireNonNull(fromStatus, "fromStatus");
        Objects.requireNonNull(toStatus, "toStatus");
    }
}