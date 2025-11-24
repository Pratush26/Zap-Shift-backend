export const priceCalculator = (senderArea, receiverArea, parcelType, weight) => {
        const interDivision = senderArea !== receiverArea
        if (parcelType === "document") {
            if (interDivision) return 80;
            else return 60;
        }
        else {
            weight = parseFloat(weight)
            if (weight > 3) {
                if (interDivision) return weight * 40 + 40;
                else return weight * 40;
            }
            else if (interDivision) return 150;
            else return 110;
        }
    }