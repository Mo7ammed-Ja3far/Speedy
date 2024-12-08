const mongoose = require("mongoose");
const puppeteer = require("puppeteer");
const DeliveryDaily = require("./schema1");
const moment = require("moment");
const DeliveryLive = require("./schema");
const fs = require("fs");
const { stringify } = require("querystring");
// const choices = [9];
// let erroid = [];
let dataForAllZones;
const choices = [0, 4, 9, 15];

const CookiesSchema = new mongoose.Schema({
  name: String,
  value: String,
  domain: String,
});
const canWorkSchema = new mongoose.Schema({
  name: String,
  value: Boolean,
});
const shiftSchema = new mongoose.Schema({
  zone: { type: String },
  break: { type: String },
  late: { type: String },
  repId: { type: String, required: true },
  shiftStart: { type: Date, required: true },
  shiftEnd: { type: Date, required: true },
  totalHours: { type: Number },
  isProcessed: { type: Boolean },
  date: { type: String, required: true },
});
const daySchema = new mongoose.Schema({
  zone: { type: String },
  break: { type: String },
  late: { type: String },
  repId: { type: String, required: true },
  date: { type: String, required: true },
  shiftData: [
    {
      shiftStart: Date,
      shiftEnd: Date,
      totalHours: Number,
    },
  ],
  totalHoursForDay: { type: Number, default: 0 },
});
const Cookies = mongoose.model("Cookie", CookiesSchema);
const canWork = mongoose.model("canWork", canWorkSchema);
const Shift = mongoose.model("Shift", shiftSchema);
const Day = mongoose.model("Day", daySchema);

////////////////////////////////////

const calculateBreakDistribution = (breakTime) => {
  const timeParts = breakTime.split(":").map(Number);
  return {
    total: convertTimeToMinutes(breakTime),
    hours: timeParts[0],
    minutes: timeParts[1],
  };
};
// ظظظظظظظظظظظظظظظظظظظ
async function connectToDatabase() {
  try {
    await mongoose.connect(
      "mongodb+srv://mo7ammedja3far:B2V4mXs12AsVZvbS@cluster0.7z5bs.mongodb.net/Speedy",
      { useNewUrlParser: true, useUnifiedTopology: true }
    );
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
    throw new Error("Database connection failed"); // استثناء لإعادة المحاولة
  }
}
async function scrapeData() {
  console.log("Starting scraper...");
  try {
    const browser = await puppeteer.launch({
      headless: false,
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      userDataDir: "./chrome-user-data",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
    );

    // تحميل الكوكيز
    const cookies = await Cookies.find();
    await page.setCookie(
      ...cookies.map(({ name, value, domain }) => ({
        name,
        value,
        domain,
      }))
    );
    ////////////////////////////////////////////////////////////////////////////////////////////////
    let allData = [];
    await page.goto(
      "https://eg.me.logisticsbackoffice.com/dashboard/rooster/live?cityId=208&page=0&size=50&sort_by=break_time&sort_direction=desc",
      { waitUntil: "domcontentloaded" }
    );
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 2000 + 1000)
    );
    await page.goto(
      "https://eg.me.logisticsbackoffice.com/dashboard/rooster/live?cityId=208&page=0&size=50&sort_by=break_time&sort_direction=desc",
      { waitUntil: "domcontentloaded" }
    );
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 2000 + 1000)
    );
    const isElementPresent = !!(await page.$('input[id="input28"]'));

    if (isElementPresent) {
      console.log("Login page detected. Handling login...");
      const handel = await canWork.updateOne(
        { name: "need to ReLogin" },
        { value: true },
        { upsert: true }
      );
      console.log("Exiting script due to login requirement.");
      await browser.close();
      return;
    }
    const handel = await canWork.updateOne(
      { name: "need to ReLogin" },
      { value: false },
      { upsert: true }
    );

    console.log("Target page loaded successfully.");
    for (let choice of choices) {
      await page.waitForSelector(
        ".sc-oTNDV.hrMbaf.FlexItem-Root.PackItem-Root.sc-plVHf.eDTkCS.HeaderNavigationSelector-SelectedOptionsValues"
      );
      await page.evaluate(() => {
        document
          .querySelector(
            ".sc-oTNDV.hrMbaf.FlexItem-Root.PackItem-Root.sc-plVHf.eDTkCS.HeaderNavigationSelector-SelectedOptionsValues"
          )
          .click();
      });

      await page.waitForSelector(
        ".sc-pCPXO.cyYyMQ.OptionListItem-Root.OptionList-Item"
      );
      await page.evaluate((choice) => {
        document
          .querySelectorAll(
            ".sc-pCPXO.cyYyMQ.OptionListItem-Root.OptionList-Item"
          )
          [choice].click();
      }, choice);
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 2000 + 1000)
      );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 2000 + 1000)
      );
      const pageData = await extractDataFromPage(page);
      allData = allData.concat(pageData);
      // const rider = await Delivery.find();

      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 2000 + 1000)
      );
    }
    await browser.close();
    await UpdateData(allData);
  } catch (err) {
    console.error("Error in scraping:", err);
    throw err;
  }
}
async function extractDataFromPage(page) {
  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll("tbody tr")).map((row) => {
      const cells = row.querySelectorAll("td");

      return {
        Worker: cells[0]?.innerText.trim(),
        Planned: cells[1]?.innerText.trim(),
        Work: cells[2]?.innerText.trim(),
        Nonwork: cells[3]?.innerText.trim(),
        Status: cells[4]?.innerText.trim(),
      };
    });
  });
}
async function UpdateData(scrapData) {
  await DeliveryLive.deleteMany({});
  dataForAllZones = {};
  const rawData = await scrapData; // اجلب البيانات
  const processedData = await processExtractedData(rawData); // قم بتحليلها
  processedData.forEach(async (e) => {
    if (e != null) {
      dataForAllZones[e.zone] = {
        numOfRiders: (Number(dataForAllZones[e.zone]?.numOfRiders) || 0) + 1,
        expctedHoures:
          (Number(dataForAllZones[e.zone]?.expctedHoures) || 0) +
          Number(Math.abs(e.plannedTimeDifference.hoursBeforeMidnight || 0)),
      };
      // تحديث أو إضافة بيانات بناءً على اسم الـ Worker
      const result = await DeliveryDaily.updateOne(
        { id: e.id },
        {
          $set: e,
        },
        { upsert: true }
      );
      const Live = await DeliveryLive.updateOne(
        { id: e.id },
        {
          $set: e,
        },
        { upsert: true }
      );
      fs.writeFileSync("output.json", JSON.stringify(scrapData, null, 2));
    } else {
      console.log(e);
    }
  });
  console.log(dataForAllZones);
}
const processExtractedData = async (data) => {
  return await Promise.all(
    data.map(async (rider) => {
      const [name, , id, , phone] = rider.Worker.split("\n");
      const [, zone, , , , Time] = rider.Planned.split("\n");
      const [status] = rider.Status.split("\n");
      const [, deliveries, , workedTime, , utr] = rider.Work.split("\n");
      const [, numBreaks, , breakTime, , late] = rider.Nonwork.split("\n");

      const breakOb = calculateBreakDistribution(breakTime);
      const isNextDayShift = Time.includes("+1");
      const isBackDayShift = Time.includes("-1");

      let startTime = "00:00";
      let endTime = "00:00";
      try {
        if (Time === "--:--") {
          const lastShift = await Shift.findOne({ repId: id }).sort({
            shiftEnd: -1,
          });
          if (lastShift) {
            startTime = moment(lastShift.shiftStart).format("HH:mm");
            endTime = moment(lastShift.shiftEnd).format("HH:mm");
          } else {
            return null; // إذا لم يتم العثور على بيانات سابقة
          }
        } else {
          const cleanedTime = Time.replace(/\s*\((-1|\+1)\)\s*/g, "")
            .replace(/\s*-\s*/g, " - ")
            .trim();
          if (cleanedTime.includes(" - ")) {
            [startTime, endTime] = cleanedTime.split(" - ");
          }
        }
        const plannedTime = calculatePlannedTimeDifference(startTime, endTime);
        let shiftStart = moment(startTime, "HH:mm").toDate();
        let shiftEnd = moment(endTime, "HH:mm").toDate();
        if (
          status == "Late" ||
          status == "Starting soon" ||
          status == "Ready"
        ) {
        } else {
          if (isNextDayShift) {
            const beforeMidnightHours = plannedTime.hoursBeforeMidnight;
            const afterMidnightHours = plannedTime.hoursAfterMidnight;
            await processShift(
              id,
              moment("00:00", "HH:mm").add(1, "days").toDate(),
              moment(endTime, "HH:mm").add(1, "days").toDate(),
              afterMidnightHours,
              zone
            );
            await processShift(
              id,
              moment(startTime, "HH:mm").toDate(),
              moment("00:00", "HH:mm").add(1, "days").toDate(),
              beforeMidnightHours,
              zone
            );
          } else if (isBackDayShift) {
            await processShift(
              id,
              moment(startTime, "HH:mm").subtract(1, "days").toDate(),
              moment("00:00", "HH:mm").toDate(),
              plannedTime.hoursBeforeMidnight,
              zone
            );
            await processShift(
              id,
              moment("00:00", "HH:mm").toDate(),
              moment(endTime, "HH:mm").toDate(),
              plannedTime.hoursAfterMidnight,
              zone
            );
          } else {
            await processShift(
              id,
              shiftStart,
              shiftEnd,
              plannedTime.total,
              zone
            );
          }
        }
        return {
          name,
          id,
          phone,
          zone,
          status,
          numBreaks,
          plannedTimeDifference: plannedTime,
          deliveries: Number(deliveries),
          workedTime,
          utr: parseFloat(utr),
          late,
          startTime,
          endTime,
          totalHours: plannedTime.totalHours,
          breakTime,
          break: breakOb,
        };
      } catch (error) {
        console.error("Error processing rider data:", error.message, "  ", id);
        return null;
      }
    })
  );
};

const calculatePlannedTimeDifference = (startTime, endTime) => {
  let startMoment = moment(startTime, "HH:mm");
  let endMoment = moment(endTime, "HH:mm");

  // إذا كان الشيفت يمتد إلى اليوم التالي
  if (endMoment.isBefore(startMoment) || endTime === "00:00") {
    endMoment.add(1, "days"); // إضافة يوم جديد للنهاية
  }

  // حساب الفرق الكلي بين البداية والنهاية
  const totalHours = endMoment.diff(startMoment, "hours", true);

  // تعريف منتصف الليل
  const midnight = moment("00:00", "HH:mm").add(1, "days"); // منتصف الليل التالي

  let hoursBeforeMidnight = 0;
  let hoursAfterMidnight = 0;

  // حساب الساعات قبل وبعد منتصف الليل
  if (startMoment.isBefore(midnight) && endMoment.isAfter(midnight)) {
    hoursBeforeMidnight = midnight.diff(startMoment, "hours", true);
    hoursAfterMidnight = totalHours - hoursBeforeMidnight;
  } else if (endMoment.isSame(midnight)) {
    hoursBeforeMidnight = midnight.diff(startMoment, "hours", true);
    hoursAfterMidnight = 0;
  } else if (endMoment.isBefore(midnight)) {
    hoursBeforeMidnight = totalHours;
  } else {
    hoursAfterMidnight = totalHours;
  }

  // ضمان عدم وجود قيم سالبة
  return {
    total: Math.max(0, totalHours),
    hoursBeforeMidnight: Math.max(0, hoursBeforeMidnight),
    hoursAfterMidnight: Math.max(0, hoursAfterMidnight),
  };
};

const processShift = async (repId, shiftStart, shiftEnd, totalHours, zone) => {
  const currentDate = moment(shiftStart).format("YYYY-MM-DD");
  const midnight = moment("00:00", "HH:mm").add(1, "days");

  try {
    if (moment(shiftEnd).isAfter(midnight)) {
      // تقسيم الشيفت إلى قسمين: قبل وبعد منتصف الليل
      const hoursBeforeMidnight = midnight.diff(
        moment(shiftStart),
        "hours",
        true
      );
      const hoursAfterMidnight = totalHours - hoursBeforeMidnight;

      // معالجة الجزء قبل منتصف الليل (تابع لليوم الأصلي)
      await processShiftPart(
        repId,
        shiftStart,
        midnight.toDate(),
        hoursBeforeMidnight,
        zone,
        currentDate
      );
      const nextDate = moment(shiftStart).format("YYYY-MM-DD");
      await processShiftPart(
        repId,
        midnight.toDate(),
        shiftEnd,
        hoursAfterMidnight,
        zone,
        nextDate
      );
    } else {
      // إذا كان الشيفت بالكامل ضمن نفس اليوم
      await processShiftPart(
        repId,
        shiftStart,
        shiftEnd,
        totalHours,
        zone,
        currentDate
      );
    }
  } catch (error) {
    console.error(`Error processing shift for repId ${repId}:`, error.message);
  }
};

const processShiftPart = async (
  repId,
  shiftStart,
  shiftEnd,
  totalHours,
  zone,
  date
) => {
  try {
    // البحث عن الشيفتات بنفس التاريخ ونفس الفترة الزمنية
    const existingShift = await Shift.findOne({
      repId,
      date,
      $or: [
        // التحقق إذا كان الشيفت الجديد يبدأ أو ينتهي داخل شيفت موجود
        { shiftStart: { $lte: shiftStart }, shiftEnd: { $gte: shiftStart } },
        { shiftStart: { $lte: shiftEnd }, shiftEnd: { $gte: shiftEnd } },
        // التحقق إذا كان الشيفت الجديد يغطي شيفت موجود بالكامل
        { shiftStart: { $gte: shiftStart }, shiftEnd: { $lte: shiftEnd } },
      ],
    });

    if (existingShift) {
      // إذا كان الشيفت موجود، قم بتحديثه إذا لزم الأمر
      const updatedTotalHours = moment(shiftEnd).diff(
        moment(shiftStart),
        "hours",
        true
      );

      if (
        !moment(existingShift.shiftStart).isSame(shiftStart) ||
        !moment(existingShift.shiftEnd).isSame(shiftEnd) ||
        existingShift.totalHours !== updatedTotalHours ||
        existingShift.zone !== zone
      ) {
        // تحديث بيانات الشيفت
        await Shift.updateOne(
          { _id: existingShift._id },
          {
            $set: {
              shiftStart,
              shiftEnd,
              totalHours: updatedTotalHours,
              zone,
              isProcessed: true,
            },
          }
        );

        // تحديث بيانات اليوم
        await Day.updateOne(
          { repId, date },
          {
            $set: {
              zone,
              "shiftData.$[elem].shiftStart": shiftStart,
              "shiftData.$[elem].shiftEnd": shiftEnd,
              "shiftData.$[elem].totalHours": updatedTotalHours,
              "shiftData.$[elem].zone": zone,
            },
            $inc: {
              totalHoursForDay: updatedTotalHours - existingShift.totalHours,
            },
          },
          {
            arrayFilters: [{ "elem.shiftStart": existingShift.shiftStart }],
          }
        );
      }
    } else {
      // إذا لم يكن هناك شيفت، قم بإضافته
      let dayRecord = await Day.findOne({ repId, date });

      if (!dayRecord) {
        // إذا لم يكن هناك سجل يومي، قم بإنشائه
        dayRecord = new Day({
          zone,
          repId,
          date,
          shiftData: [],
          totalHoursForDay: 0,
        });
      }

      // إضافة بيانات الشيفت
      dayRecord.shiftData.push({
        shiftStart,
        shiftEnd,
        totalHours,
        zone,
      });
      dayRecord.totalHoursForDay += totalHours;

      await dayRecord.save();

      // إنشاء سجل جديد في مجموعة Shift
      await Shift.create({
        repId,
        shiftStart,
        shiftEnd,
        totalHours,
        zone,
        date,
        isProcessed: true,
      });

      console.log(
        `New shift created for repId: ${repId} on ${date} zone:${zone}.`
      );
    }
  } catch (error) {
    console.error(
      `Error processing shift part for repId ${repId}:`,
      error.message
    );
  }
};

function convertTimeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}
async function main() {
  let attemptCount = 0;

  while (true) {
    try {
      const needToLogin = await canWork.find();
      if (!needToLogin[0]["value"]) {
        console.log("Scraping data...");
        await scrapeData();
        break;
      } else {
        console.log("Needing To ReLogin");
      }
      attemptCount++;
      console.log(`Attempt #${attemptCount}`);
      console.log("Waiting 20 minutes before the next attempt...");
      await new Promise((resolve) => setTimeout(resolve, 20 * 60 * 1000));
    } catch (err) {
      console.error("An error occurred. Retrying...Waiting 20 minutes");
      await new Promise((resolve) => setTimeout(resolve, 20 * 60 * 1000));
    }
  }
  //كل فد اي
  setTimeout(main, 7 * 60 * 1000);
}

async function scraper() {
  await connectToDatabase();
  main();
}
// let data = [
//   {
//     Worker:
//       "Ahmed Abd-Elfatah Elsaeed Mohamed SPEEDY\nID\n2118428\nPhone\n+201203933985",
//     Planned:
//       "Zone\nAl mahallah al kubra\nStarting point\nAl mahallah al kubra sp\nTimes\n19:00 (-1) - 04:00",
//     Work: "Deliveries\n17\nTime worked\n08:53\nUTR\n1.9",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker: "Amir Hossam Souliman_ SPPEDY\nID\n2375729\nPhone\n+201112758394",
//     Planned:
//       "Zone\nAl mahallah al kubra\nStarting point\nAl mahallah al kubra sp\nTimes\n19:00 (-1) - 04:00",
//     Work: "Deliveries\n18\nTime worked\n09:03\nUTR\n2.0",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nActive delivery",
//   },
//   {
//     Worker:
//       "Mostafa Amin Fathy Zaki _SPEEDY\nID\n2458332\nPhone\n+201040680089",
//     Planned:
//       "Zone\nAl mahallah al kubra\nStarting point\nAl mahallah al kubra sp\nTimes\n19:00 (-1) - 04:00",
//     Work: "Deliveries\n18\nTime worked\n08:41\nUTR\n2.1",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker:
//       "Hany Mohamad Waly Eldin Abdelwahed Barr_SPEEDY\nID\n2037845\nPhone\n+201285699142",
//     Planned:
//       "Zone\nAl mahallah al kubra\nStarting point\nAl mahallah al kubra sp\nTimes\n16:30 (-1) - 04:00",
//     Work: "Deliveries\n19\nTime worked\n11:30\nUTR\n1.7",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker: "Eslam Elsayed Ebrahem_SPEEDY\nID\n2037567\nPhone\n+201004570606",
//     Planned:
//       "Zone\nAl mahallah al kubra\nStarting point\nAl mahallah al kubra sp\nTimes\n18:00 (-1) - 04:00",
//     Work: "Deliveries\n13\nTime worked\n09:44\nUTR\n1.3",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker: "Ahmed Samir Ahmed_SPEEDY\nID\n2266924\nPhone\n+201554539509",
//     Planned:
//       "Zone\nAl mahallah al kubra\nStarting point\nAl mahallah al kubra sp\nTimes\n17:00 (-1) - 04:00",
//     Work: "Deliveries\n19\nTime worked\n10:41\nUTR\n1.8",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker: "Mostafa Moaz Labieb_SPEEDY\nID\n2375419\nPhone\n+201070273652",
//     Planned:
//       "Zone\nAl mahallah al kubra\nStarting point\nAl mahallah al kubra sp\nTimes\n18:00 (-1) - 04:00",
//     Work: "Deliveries\n21\nTime worked\n10:03\nUTR\n2.1",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nActive delivery",
//   },
//   {
//     Worker:
//       "Ragheb Hany Samwaeel Esa SPEEDY\nID\n2063033\nPhone\n+201503306001",
//     Planned:
//       "Zone\nAl mahallah al kubra\nStarting point\nAl mahallah al kubra sp\nTimes\n20:00 (-1) - 04:00",
//     Work: "Deliveries\n19\nTime worked\n07:51\nUTR\n2.4",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker:
//       "Ahmed Samir Shawqy Abdelmenaim _SPEEDY\nID\n2459190\nPhone\n+201152327485",
//     Planned:
//       "Zone\nMadinaty\nStarting point\nMadinaty 4 sp craft zone\nTimes\n16:30 (-1) - 04:30",
//     Work: "Deliveries\n1\nTime worked\n07:04\nUTR\n0.1",
//     Nonwork: "Breaks\n2\nTotal break\n03:57\nLate\n00:09",
//     Status: "Break by dispatcher\nNo active delivery",
//   },
//   {
//     Worker:
//       "Khaled Ramadan Jomaa Ahmed _SPEEDY\nID\n2197457\nPhone\n+201152301110",
//     Planned:
//       "Zone\nMadinaty\nStarting point\nMadinaty 2 sp central park\nTimes\n17:15 (-1) - 04:00",
//     Work: "Deliveries\n19\nTime worked\n10:33\nUTR\n1.8",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker:
//       "Osama Mostafa Geoshy Mohamed _SPEEDY\nID\n2434599\nPhone\n+201110212280",
//     Planned:
//       "Zone\nMadinaty\nStarting point\nMadinaty 2 sp central park\nTimes\n13:15 (-1) - 04:00",
//     Work: "Deliveries\n27\nTime worked\n14:40\nUTR\n1.8",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker: "Khaled Ahmed Ramdan_SPEEDY_BC\nID\n2097637\nPhone\n+201557306330",
//     Planned:
//       "Zone\nMansoura\nStarting point\nMansoura university sp\nTimes\n21:30 (-1) - 04:15",
//     Work: "Deliveries\n13\nTime worked\n06:11\nUTR\n2.1",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker:
//       "Abdel Hady Abdel Rahman Mohamed _SPEEDY\nID\n2203717\nPhone\n+201065104557",
//     Planned:
//       "Zone\nMansoura\nStarting point\nMansoura downtown sp\nTimes\n23:15 (-1) - 06:15",
//     Work: "Deliveries\n0\nTime worked\n00:00\nUTR\n0",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n04:26",
//     Status: "Late\nNo active delivery",
//   },
//   {
//     Worker:
//       "Mostafa Lotfy Abdelrazik_SPEEDY\nID\n2154531\nPhone\n+201099310727",
//     Planned:
//       "Zone\nMansoura\nStarting point\nMansoura downtown sp\nTimes\n23:30 (-1) - 05:30",
//     Work: "Deliveries\n8\nTime worked\n04:10\nUTR\n1.9",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nActive delivery",
//   },
//   {
//     Worker:
//       "Omar Esmaeel Husain Esmaeel_SPEEDY\nID\n2118419\nPhone\n+201000245448",
//     Planned:
//       "Zone\nMansoura\nStarting point\nMansoura university sp\nTimes\n03:30 - 09:30",
//     Work: "Deliveries\n1\nTime worked\n00:20\nUTR\n3",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nActive delivery",
//   },
//   {
//     Worker:
//       "Abd Elhamed Ahmed Ahmed Abd Elhamed _SPEEDY\nID\n1958832\nPhone\n+201112933664",
//     Planned:
//       "Zone\nMansoura\nStarting point\nMansoura university sp\nTimes\n02:00 - 09:00",
//     Work: "Deliveries\n3\nTime worked\n01:47\nUTR\n1.7",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nActive delivery",
//   },
//   {
//     Worker: "Taha Nagah Taha_SPEEDY_BC\nID\n2165204\nPhone\n+201014858951",
//     Planned:
//       "Zone\nMansoura\nStarting point\nMansoura downtown sp\nTimes\n00:45 - 12:00",
//     Work: "Deliveries\n6\nTime worked\n03:20\nUTR\n1.8",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker: "Mohamed Wageh Fathy_SPEEDY\nID\n2165084\nPhone\n+201099505975",
//     Planned:
//       "Zone\nMansoura\nStarting point\nMansoura university sp\nTimes\n02:15 - 08:15",
//     Work: "Deliveries\n3\nTime worked\n01:29\nUTR\n2.0",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nActive delivery",
//   },
//   {
//     Worker: "Mostafa Labeeb Labeeb _SPEEDY\nID\n2430256\nPhone\n+201023871824",
//     Planned:
//       "Zone\nMansoura\nStarting point\nMansoura university sp\nTimes\n23:00 (-1) - 05:30",
//     Work: "Deliveries\n0\nTime worked\n00:00\nUTR\n0",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n04:40",
//     Status: "Late\nNo active delivery",
//   },
//   {
//     Worker: "Bilal Ali Alsayed_SPEEDY\nID\n2369539\nPhone\n+201553202524",
//     Planned: "Zone\nTanta\nStarting point\nTanta sp\nTimes\n01:45 - 07:45",
//     Work: "Deliveries\n4\nTime worked\n01:59\nUTR\n2.0",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker:
//       "Abd-Ellatef Ali Abd-Allah Nosair_SPEEDY\nID\n2016341\nPhone\n+201015662032",
//     Planned: "Zone\nTanta\nStarting point\nTanta sp\nTimes\n20:00 (-1) - 04:00",
//     Work: "Deliveries\n15\nTime worked\n07:41\nUTR\n2.0",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker: "Ebrahem Zakaria Mohamed_SPEEDY\nID\n2196025\nPhone\n+201277801563",
//     Planned: "Zone\nTanta\nStarting point\nTanta sp\nTimes\n20:00 (-1) - 03:45",
//     Work: "Deliveries\n13\nTime worked\n07:40\nUTR\n1.7",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker: "Mazen Mokhtar Mohamed _ SPEEDY\nID\n2264123\nPhone\n+201040193599",
//     Planned: "Zone\nTanta\nStarting point\nTanta sp\nTimes\n23:15 (-1) - 05:15",
//     Work: "Deliveries\n0\nTime worked\n04:26\nUTR\n0",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nNo active delivery",
//   },
//   {
//     Worker:
//       "Ahmad Belal Mohamed Zozo _SPEEDY\nID\n2445378\nPhone\n+201552456221",
//     Planned: "Zone\nTanta\nStarting point\nTanta sp\nTimes\n20:00 (-1) - 03:45",
//     Work: "Deliveries\n13\nTime worked\n07:41\nUTR\n1.7",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nActive delivery",
//   },
//   {
//     Worker:
//       "Abdullah Alsayed Alsayed Sahali _SPEEDY\nID\n2474843\nPhone\n+201275007622",
//     Planned: "Zone\nTanta\nStarting point\nTanta sp\nTimes\n22:15 (-1) - 05:30",
//     Work: "Deliveries\n6\nTime worked\n04:57\nUTR\n1.2",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:28",
//     Status: "Working\nActive delivery",
//   },
//   {
//     Worker: "Salah Mohamed Ebrahim_SPEEDY\nID\n2154984\nPhone\n+201033330806",
//     Planned: "Zone\nTanta\nStarting point\nTanta sp\nTimes\n21:00 (-1) - 05:00",
//     Work: "Deliveries\n15\nTime worked\n06:44\nUTR\n2.2",
//     Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//     Status: "Working\nActive delivery",
//   },
// ];
// async function scraper() {
//   await connectToDatabase();
//   // main();
//   await UpdateData(data);
//   setInterval(async () => {
//     await UpdateData(data);
//   }, 0.5 * 60 * 1000);
// }

scraper();
const cleanDatabase = async () => {
  try {
    // تنظيف مجموعة Shift
    const shifts = await Shift.aggregate([
      {
        $group: {
          _id: {
            repId: "$repId",
            date: "$date",
            shiftStart: "$shiftStart",
            shiftEnd: "$shiftEnd",
          },
          duplicates: { $push: "$_id" },
          count: { $sum: 1 },
        },
      },
      {
        $match: { count: { $gt: 1 } },
      },
    ]);

    for (const shift of shifts) {
      const { duplicates } = shift;

      duplicates.shift();
      await Shift.deleteMany({ _id: { $in: duplicates } });
    }

    console.log("Duplicate shifts cleaned.");

    // تنظيف مجموعة Day
    const days = await Day.find();

    for (const day of days) {
      const validShifts = [];
      const seenShifts = new Set();

      for (const shift of day.shiftData) {
        const key = `${shift.shiftStart}-${shift.shiftEnd}-${shift.totalHours}`;
        if (
          !seenShifts.has(key) &&
          shift.shiftStart &&
          shift.shiftEnd &&
          shift.totalHours
        ) {
          validShifts.push(shift); // إضافة الشيفت الصحيح
          seenShifts.add(key);
        }
      }

      // تحديث السجل إذا تم العثور على شيفتات غير صالحة
      if (validShifts.length !== day.shiftData.length) {
        const totalHoursForDay = validShifts.reduce(
          (sum, s) => sum + s.totalHours,
          0
        );

        await Day.updateOne(
          { _id: day._id },
          {
            $set: {
              zone,
              shiftData: validShifts,
              totalHoursForDay,
            },
          }
        );
      }
    }
  } catch (error) {
    console.error("Error cleaning database:", error.message);
  }
};

async function getRepMonthlyHours(repId, month, year) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const hoursArray = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayString = `${year}-${month}-${day}`;
    const record = await Shift.findOne({ day: dayString });

    if (!record || record.shifts.length === 0) {
      hoursArray.push(null); // اليوم فارغ
    } else {
      // تصفية الشيفتات الخاصة بـ repId فقط
      const repShifts = record.shifts.filter(
        (shift) => shift.repId.toString() === repId.toString()
      );

      if (repShifts.length === 0) {
        hoursArray.push(null); // لا توجد شيفتات لهذا المندوب
      } else {
        const totalHours = repShifts.reduce(
          (sum, shift) => sum + shift.hours,
          0
        );
        hoursArray.push(totalHours);
      }
    }
  }

  return hoursArray;
}
// {
//   Worker:
//     "Ahmed Abd-Elfatah Elsaeed Mohamed SPEEDY\nID\n2118428\nPhone\n+201203933985",
//   Planned:
//     "Zone\nAl mahallah al kubra\nStarting point\nAl mahallah al kubra sp\nTimes\n22:00 (-1) - 04:00",
//   Work: "Deliveries\n17\nTime worked\n09:09\nUTR\n1.9",
//   Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//   Status: "Working\nNo active delivery",
// },
// {
//   Worker:
//     "Ahmed Abd-Elfatah Elsaeed Mohamed SPEEDY\nID\n2118428\nPhone\n+201203933985",
//   Planned:
//     "Zone\nAl mahallah al kubra\nStarting point\nAl mahallah al kubra sp\nTimes\n05:00 - 10:00",
//   Work: "Deliveries\n17\nTime worked\n09:09\nUTR\n1.9",
//   Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//   Status: "Working\nNo active delivery",
// },
// {
//   Worker:
//     "Ahmed Abd-Elfatah Elsaeed Mohamed SPEEDY\nID\n2118428\nPhone\n+201203933985",
//   Planned:
//     "Zone\nAl mahallah al kubra\nStarting point\nAl mahallah al kubra sp\nTimes\n21:00 - 04:00 (+1)",
//   Work: "Deliveries\n17\nTime worked\n09:09\nUTR\n1.9",
//   Nonwork: "Breaks\n0\nTotal break\n00:00\nLate\n00:00",
//   Status: "Working\nNo active delivery",
// },
