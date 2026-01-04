package com.dhruv.taskmanager.domain;

import java.util.Locale;

public enum TaskStatus {
    OPEN,
    IN_PROGRESS,
    DONE;

    public static TaskStatus from(String raw) {
        if (raw == null || raw.isBlank()) return null;
        return TaskStatus.valueOf(raw.trim().toUpperCase(Locale.ROOT));
    }
}