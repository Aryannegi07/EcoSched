package com.syscore.ecosched.scheduler;

import com.syscore.ecosched.exception.ConflictException;
import com.syscore.ecosched.exception.SchedulerUnavailableException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Process bridge to the C scheduler (scheduler/ecosched_scheduler).
 * Java writes the database state to the program's stdin and reads its decision from stdout.
 * Exit codes: 0 ok, 2 bad input/data, 3 rejected by scheduler rules, anything else = program failure.
 */
@Component
public class SchedulerBridge {

    private final String configuredPath;
    private final int timeoutSeconds;

    public SchedulerBridge(@Value("${ecosched.scheduler.path:}") String configuredPath,
                           @Value("${ecosched.scheduler.timeout-seconds:10}") int timeoutSeconds) {
        this.configuredPath = configuredPath == null ? "" : configuredPath.trim();
        this.timeoutSeconds = timeoutSeconds;
    }

    /** The executable that will be used, or null if none is found. */
    public File resolveBinary() {
        List<String> candidates = new ArrayList<>();
        if (!configuredPath.isEmpty()) candidates.add(configuredPath);
        candidates.add("../scheduler/ecosched_scheduler");   // started from backend/
        candidates.add("scheduler/ecosched_scheduler");      // started from the project root
        for (String c : candidates) {
            for (String suffix : new String[] {"", ".exe"}) {
                File f = new File(c + suffix);
                if (f.isFile() && f.canExecute()) return f.getAbsoluteFile();
            }
        }
        return null;
    }

    public boolean isAvailable() { return resolveBinary() != null; }

    /**
     * Runs "ecosched_scheduler <command> [arg]" with the given stdin text and returns the stdout lines.
     * Rule rejections become 409 Conflict; a missing/crashed program becomes 503.
     */
    public List<String> execute(String command, String arg, String stdinText) {
        File bin = resolveBinary();
        if (bin == null) {
            throw new SchedulerUnavailableException("C scheduler not found. Build it with 'cd scheduler && make' "
                    + "(or set SCHEDULER_BIN to the full path of ecosched_scheduler).");
        }
        List<String> cmd = new ArrayList<>();
        cmd.add(bin.getPath());
        cmd.add(command);
        if (arg != null) cmd.add(arg);

        Process p;
        try {
            p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
        } catch (IOException e) {
            throw new SchedulerUnavailableException("Could not start the C scheduler: " + e.getMessage(), e);
        }

        final Process proc = p;
        CompletableFuture<String> output = CompletableFuture.supplyAsync(() -> {
            try (InputStream in = proc.getInputStream()) {
                return new String(in.readAllBytes(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });

        try (OutputStream os = p.getOutputStream()) {
            os.write(stdinText.getBytes(StandardCharsets.UTF_8));
        } catch (IOException ignored) {
            // The program may already have exited with an ERROR line; its output is read below.
        }

        try {
            if (!p.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                throw new SchedulerUnavailableException("C scheduler timed out after " + timeoutSeconds + " seconds");
            }
            String text = output.get(5, TimeUnit.SECONDS);
            int exit = p.exitValue();
            List<String> lines = new ArrayList<>();
            for (String line : text.split("\\R")) {
                if (!line.isBlank()) lines.add(line.trim());
            }
            if (exit == 0) return lines;

            String message = lines.stream().filter(l -> l.startsWith("ERROR")).findFirst()
                    .map(l -> l.substring(5).trim()).orElse("exit code " + exit);
            if (exit == 2 || exit == 3) {
                throw new ConflictException("Scheduler rejected the request: " + message);
            }
            throw new SchedulerUnavailableException("C scheduler failed: " + message);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            p.destroyForcibly();
            throw new SchedulerUnavailableException("Interrupted while waiting for the C scheduler", e);
        } catch (ExecutionException | TimeoutException e) {
            p.destroyForcibly();
            throw new SchedulerUnavailableException("Could not read the C scheduler output", e);
        }
    }
}
