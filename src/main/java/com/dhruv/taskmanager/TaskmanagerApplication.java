package com.dhruv.taskmanager;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import java.util.Set;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.dhruv.taskmanager.model.User;
import com.dhruv.taskmanager.repository.UserRepository;
import com.dhruv.taskmanager.service.TaskService;

@SpringBootApplication
public class TaskmanagerApplication {
    public static void main(String[] args) {
        SpringApplication.run(TaskmanagerApplication.class, args);
    }

    // Seed an ADMIN user on first run + sample tasks
    @Bean CommandLineRunner seedAdmin(UserRepository users, PasswordEncoder enc, TaskService tasks) {
        return args -> {
            users.findByUsername("admin").orElseGet(() -> {
                User u = new User();
                u.setUsername("admin");
                u.setPassword(enc.encode("admin123"));
                u.setRoles(Set.of("ADMIN"));
                return users.save(u);
            });
            tasks.ensureSample("admin");
        };
    }
}
