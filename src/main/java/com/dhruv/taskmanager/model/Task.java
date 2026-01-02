package com.dhruv.taskmanager.model;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("tasks")
public class Task {
    @Id private String id;
    private String title;
    private String description;
    private String status;   // OPEN, IN_PROGRESS, DONE
    private String priority; // LOW, MEDIUM, HIGH
    private Instant dueDate;
    private String assignee;
    private String owner;    // username who created

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }
    public Instant getDueDate() { return dueDate; }
    public void setDueDate(Instant dueDate) { this.dueDate = dueDate; }
    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }
    public String getOwner() { return owner; }
    public void setOwner(String owner) { this.owner = owner; }
}