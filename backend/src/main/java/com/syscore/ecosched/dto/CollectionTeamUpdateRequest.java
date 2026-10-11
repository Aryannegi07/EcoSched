package com.syscore.ecosched.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** JSON body for PUT /api/teams/{id}. The status is NOT editable here: only the scheduler changes it. */
public class CollectionTeamUpdateRequest {

    @NotBlank(message = "team_name is required")
    @Size(max = 100, message = "team_name must be at most 100 characters")
    private String teamName;

    @NotBlank(message = "contact_phone is required")
    @Pattern(regexp = "^\\+?[0-9]{10,13}$", message = "contact_phone must be 10 to 13 digits (optional leading +)")
    private String contactPhone;

    @Size(max = 20, message = "vehicle_number must be at most 20 characters")
    private String vehicleNumber;

    public String getTeamName() { return teamName; }
    public void setTeamName(String teamName) { this.teamName = teamName; }
    public String getContactPhone() { return contactPhone; }
    public void setContactPhone(String contactPhone) { this.contactPhone = contactPhone; }
    public String getVehicleNumber() { return vehicleNumber; }
    public void setVehicleNumber(String vehicleNumber) { this.vehicleNumber = vehicleNumber; }
}
