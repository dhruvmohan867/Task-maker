package com.dhruv.taskmanager.events;

public record TaskCreatedEvent(String taskId, String actor) {}