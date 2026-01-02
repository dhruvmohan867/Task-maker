package com.dhruv.taskmanager.controller;

import java.util.Map;
import java.util.Set;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import com.dhruv.taskmanager.model.User;
import com.dhruv.taskmanager.repository.UserRepository;
import com.dhruv.taskmanager.security.JwtService;

@RestController
@RequestMapping("/auth")
public class AuthController {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    public AuthController(UserRepository users, PasswordEncoder encoder, JwtService jwt) {
        this.users = users; this.encoder = encoder; this.jwt = jwt;
    }

    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody Map<String,String> body) {
        String name = body.get("name");
        String email = body.get("email");
        String u = body.get("username");
        String p = body.get("password");
        if (name == null || email == null || u == null || p == null)
            return ResponseEntity.badRequest().body("name/email/username/password required");
        if (users.findByUsername(u).isPresent())
            return ResponseEntity.badRequest().body("username taken");

        User user = new User();
        user.setName(name);
        user.setEmail(email);
        user.setUsername(u);
        user.setPassword(encoder.encode(p));
        user.setRoles(Set.of("USER"));
        users.save(user);

        String token = jwt.createToken(u, user.getRoles());
        return ResponseEntity.ok(Map.of(
            "token", token,
            "roles", user.getRoles(),
            "user", Map.of("name", user.getName(), "username", user.getUsername(), "email", user.getEmail())
        ));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String,String> body) {
        String u = body.get("username"), p = body.get("password");
        var user = users.findByUsername(u).orElse(null);
        if (user == null || !encoder.matches(p, user.getPassword()))
            return ResponseEntity.status(401).body("invalid credentials");

        String token = jwt.createToken(u, user.getRoles());
        return ResponseEntity.ok(Map.of(
            "token", token,
            "roles", user.getRoles(),
            "user", Map.of("name", user.getName(), "username", user.getUsername(), "email", user.getEmail())
        ));
    }
}