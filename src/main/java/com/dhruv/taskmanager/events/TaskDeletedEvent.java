package com.dhruv.taskmanager.events;

import java.util.Objects;

public record TaskDeletedEvent(String taskId, String actor) {
    public TaskDeletedEvent {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(actor, "actor");
    }
}