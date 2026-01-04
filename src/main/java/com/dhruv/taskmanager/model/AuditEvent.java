package com.dhruv.taskmanager.model;

import java.time.Instant;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("audit_events")
public class AuditEvent {
    @Id
    private String id;

    private Instant at;
    private String type;
    private String actor;
    private String taskId;
    private String details;

    public String getId() { return id ; }
    public void setId(String id) { this.id = id; }

    public Instant getAt() { return at; }
    public void setAt(Instant at) { this.at = at; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getActor() { return actor; }
    public void setActor(String actor) { this.actor = actor; }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getDetails() { return details; }
    public void setDetails(String details) { this.details = details; }
}