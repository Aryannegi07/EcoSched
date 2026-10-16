package com.syscore.ecosched.controller;
import com.syscore.ecosched.dto.UserRequest; import com.syscore.ecosched.entity.User; import com.syscore.ecosched.repository.UserRepository; import com.syscore.ecosched.service.UserService; import jakarta.servlet.http.*; import jakarta.validation.Valid; import org.springframework.http.*; import org.springframework.security.crypto.password.PasswordEncoder; import org.springframework.web.bind.annotation.*; import org.springframework.web.server.ResponseStatusException; import java.util.Map;
@RestController @RequestMapping("/api/auth") public class AuthController {
 private final UserRepository users; private final UserService userService; private final PasswordEncoder encoder;
 public AuthController(UserRepository u,UserService s,PasswordEncoder e){users=u;userService=s;encoder=e;}
 @PostMapping("/register") @ResponseStatus(HttpStatus.CREATED) public User register(@Valid @RequestBody UserRequest b){return userService.createUser(b);}
 @PostMapping("/login") public User login(@RequestBody Map<String,String>b,HttpServletRequest r){User u=users.findByEmailIgnoreCase(b.getOrDefault("email","").trim()).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Invalid email or password"));if(!encoder.matches(b.getOrDefault("password",""),u.getPasswordHash()))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Invalid email or password");r.getSession(true).setAttribute("USER_ID",u.getUserId());r.getSession().setAttribute("ROLE",u.getRole());return u;}
 @GetMapping("/me") public User me(HttpServletRequest r){return current(r);}
 @PostMapping("/logout") @ResponseStatus(HttpStatus.NO_CONTENT) public void logout(HttpServletRequest r){HttpSession s=r.getSession(false);if(s!=null)s.invalidate();}
 public User current(HttpServletRequest r){HttpSession s=r.getSession(false);Object id=s==null?null:s.getAttribute("USER_ID");if(id==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Login required");return users.findById((Long)id).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Login required"));}
 public boolean admin(HttpServletRequest r){return "ADMIN".equals(current(r).getRole());}
}
