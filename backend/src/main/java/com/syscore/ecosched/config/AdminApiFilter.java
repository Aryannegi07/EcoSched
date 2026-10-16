
package com.syscore.ecosched.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class AdminApiFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(
            HttpServletRequest req,
            HttpServletResponse res,
            FilterChain chain
    ) throws ServletException, IOException {

        String path = req.getRequestURI()
                .substring(req.getContextPath().length());

        String method = req.getMethod();

        boolean teamsPath = path.equals("/api/teams")
                || path.startsWith("/api/teams/");

        boolean adminPath = path.startsWith("/api/admin")
                || path.startsWith("/api/scheduler")
                || teamsPath;

        /*
         * Allow read-only team information for the tracking page.
         * All team modifications remain admin-only.
         */
        boolean readOnlyTeamRequest = teamsPath
                && "GET".equalsIgnoreCase(method)
                && (path.equals("/api/teams")
                    || path.equals("/api/teams/available"));

        if (adminPath && !readOnlyTeamRequest) {
            HttpSession session = req.getSession(false);

            if (session == null
                    || !"ADMIN".equals(session.getAttribute("ROLE"))) {

                res.sendError(
                        HttpStatus.FORBIDDEN.value(),
                        "Administrator access required"
                );
                return;
            }
        }

        chain.doFilter(req, res);
    }
}
