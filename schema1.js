const mongoose = require("mongoose");
const deliverySchema = new mongoose.Schema({
  name: {
    type: String,
  },
  id: {
    type: String,
  },
  phone: {
    type: String,
  },
  zone: {
    type: String,
  },
  numBreaks: {
    type: Number,
  },
  startTime: {
    type: String, // يمكن استخدام Date إذا أردت وقتاً محددًا بصيغة التاريخ
  },
  endTime: {
    type: String,
  },
  plannedTimeDifference: {
    type: {
      total: Number,
      hoursBeforeMidnight: Number,
      hoursAfterMidnight: Number,
    },
  },

  status: {
    type: String,
  },
  deliveries: {
    type: Number,
  },
  workedTime: {
    type: String,
  },
  utr: {
    type: Number,
  },
  breaks: {
    type: Number,
  },
  break: {
    type: {
      total: Number,
      breakBeforeMidnight: Number,
      breAfterMidnight: Number,
    },
  },
  breakTime: {
    type: String,
  },
  late: {
    type: String,
  },
});

module.exports = mongoose.model("DailyDelivery", deliverySchema);
