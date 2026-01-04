package com.dhruv.taskmanager.integration;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import com.dhruv.taskmanager.events.TaskCreatedEvent;
import com.dhruv.taskmanager.events.TaskDeletedEvent;
import com.dhruv.taskmanager.events.TaskUpdatedEvent;

@Component
public class WebhookPublisher {

    private final String url;
    private final RestTemplate http;

    public WebhookPublisher(@Value("${app.webhook.url:}") String rawUrl) {
        this.url = Objects.requireNonNullElse(rawUrl, "").trim();

        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(3).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(5).toMillis());

        this.http = new RestTemplate(rf);
    }

    @Async
    @EventListener
    public void onCreated(TaskCreatedEvent e) {
        post("TASK_CREATED", Map.of("taskId", e.taskId(), "actor", e.actor()));
    }

    @Async
    @EventListener
    public void onUpdated(TaskUpdatedEvent e) {
        post("TASK_UPDATED", Map.of(
            "taskId", e.taskId(),
            "actor", e.actor(),
            "from", e.fromStatus(),
            "to", e.toStatus()
        ));
    }

    @Async
    @EventListener
    public void onDeleted(TaskDeletedEvent e) {
        post("TASK_DELETED", Map.of("taskId", e.taskId(), "actor", e.actor()));
    }

    private void post(String type, Map<String, Object> payload) {
        if (url.isBlank()) return; // optional integration

        Map<String, Object> body = Map.of(
            "type", type,
            "at", Instant.now().toString(),
            "payload", payload
        );

        try {
            final String webhookUrl = java.util.Objects.requireNonNull(this.url, "webhook url");
            http.postForEntity(webhookUrl, body, Void.class);
        } catch (Exception ignored) {
            // integration must never break core flows
        }
    }
}