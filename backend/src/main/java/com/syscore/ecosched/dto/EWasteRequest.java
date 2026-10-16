
package com.syscore.ecosched.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.syscore.ecosched.entity.EWasteCategory;
import com.syscore.ecosched.entity.ItemCondition;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

@JsonIgnoreProperties(ignoreUnknown = true)
public class EWasteRequest {

    @NotNull(message = "user_id is required")
    @JsonProperty("user_id")
    @JsonAlias("userId")
    private Long userId;

    @NotBlank(message = "item_name is required")
    @Size(max = 100, message = "item_name must be at most 100 characters")
    @JsonProperty("item_name")
    @JsonAlias("itemName")
    private String itemName;

    @NotNull(message = "category is required")
    private EWasteCategory category;

    @JsonProperty("item_condition")
    @JsonAlias("itemCondition")
    private ItemCondition itemCondition;

    @Min(value = 1, message = "quantity must be at least 1")
    @Max(value = 1000, message = "quantity must be at most 1000")
    private Integer quantity;

    @NotNull(message = "weight_kg is required")
    @DecimalMin(value = "0.01", message = "weight_kg must be at least 0.01")
    @DecimalMax(value = "99999.99", message = "weight_kg must be at most 99999.99")
    @JsonProperty("weight_kg")
    @JsonAlias("weightKg")
    private BigDecimal weightKg;

    @Size(max = 255, message = "description must be at most 255 characters")
    private String description;

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getItemName() {
        return itemName;
    }

    public void setItemName(String itemName) {
        this.itemName = itemName;
    }

    public EWasteCategory getCategory() {
        return category;
    }

    public void setCategory(EWasteCategory category) {
        this.category = category;
    }

    public ItemCondition getItemCondition() {
        return itemCondition;
    }

    public void setItemCondition(ItemCondition itemCondition) {
        this.itemCondition = itemCondition;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getWeightKg() {
        return weightKg;
    }

    public void setWeightKg(BigDecimal weightKg) {
        this.weightKg = weightKg;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
