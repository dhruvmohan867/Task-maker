package com.dhruv.taskmanager.domain;

import java.util.Locale;

public enum TaskPriority {
    LOW,
    MEDIUM,
    HIGH;

    public static TaskPriority from(String raw) {
        if (raw == null || raw.isBlank()) return null;
        return TaskPriority.valueOf(raw.trim().toUpperCase(Locale.ROOT));
    }

    public static TaskPriority max(TaskPriority a, TaskPriority b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.ordinal() >= b.ordinal() ? a : b;
    }
}