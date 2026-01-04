package com.dhruv.taskmanager.repository;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.dhruv.taskmanager.model.AuditEvent;

public interface AuditEventRepository extends MongoRepository<AuditEvent, String> {
}