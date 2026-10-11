package com.syscore.ecosched.repository;

import com.syscore.ecosched.entity.EWaste;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.util.List;

public interface EWasteRepository extends JpaRepository<EWaste, Long> {

    /** SUM(weight_kg) over all items (null when the table is empty). */
    @Query("select sum(e.weightKg) from EWaste e")
    BigDecimal totalWeightKg();

    /** SUM(quantity) over all items (null when the table is empty). */
    @Query("select sum(e.quantity) from EWaste e")
    Long totalUnits();

    /** One row per category: [category, item records, units, weight_kg]  (GROUP BY category). */
    @Query("select e.category, count(e), sum(e.quantity), sum(e.weightKg) from EWaste e group by e.category order by sum(e.weightKg) desc")
    List<Object[]> statsByCategory();

}
