package com.syscore.ecosched.dto;

import com.syscore.ecosched.entity.EWaste;
import com.syscore.ecosched.entity.EWasteCategory;
import com.syscore.ecosched.entity.ItemCondition;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** JSON returned for an e-waste item (owner is shown as a plain user_id). */
public class EWasteResponse {

    private Long itemId;
    private Long userId;
    private String itemName;
    private EWasteCategory category;
    private ItemCondition itemCondition;
    private Integer quantity;
    private BigDecimal weightKg;
    private String description;
    private String imagePath;
    private LocalDateTime createdAt;

    public static EWasteResponse from(EWaste e) {
        EWasteResponse r = new EWasteResponse();
        r.itemId = e.getItemId();
        r.userId = e.getUser().getUserId();
        r.itemName = e.getItemName();
        r.category = e.getCategory();
        r.itemCondition = e.getItemCondition();
        r.quantity = e.getQuantity();
        r.weightKg = e.getWeightKg();
        r.description = e.getDescription();
        r.imagePath = e.getImagePath();
        r.createdAt = e.getCreatedAt();
        return r;
    }

    public Long getItemId() { return itemId; }
    public Long getUserId() { return userId; }
    public String getItemName() { return itemName; }
    public EWasteCategory getCategory() { return category; }
    public ItemCondition getItemCondition() { return itemCondition; }
    public Integer getQuantity() { return quantity; }
    public BigDecimal getWeightKg() { return weightKg; }
    public String getDescription() { return description; }
    public String getImagePath() { return imagePath; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
