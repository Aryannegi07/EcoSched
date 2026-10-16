package com.syscore.ecosched.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** JSON body for POST /api/users. */
public class UserRequest {

    @NotBlank(message = "full_name is required")
    @Size(max = 100, message = "full_name must be at most 100 characters")
    private String fullName;

    @NotBlank(message = "email is required")
    @Email(message = "email must be a valid email address")
    @Size(max = 150, message = "email must be at most 150 characters")
    private String email;

    @NotBlank(message = "phone is required")
    @Pattern(regexp = "^\\+?[0-9]{10,13}$", message = "phone must be 10 to 13 digits (optional leading +)")
    private String phone;

    @NotBlank(message = "address is required")
    @Size(max = 255, message = "address must be at most 255 characters")
    private String address;
    @NotBlank(message = "password is required")
    @Size(min = 8, max = 72, message = "password must be 8 to 72 characters")
    private String password;

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
