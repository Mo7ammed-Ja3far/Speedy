const mongoose = require("mongoose");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const moment = require("moment");
const info = {
  "120363350837337957@g.us": "Tanta",
  "120363351929078893@g.us": "Al mahallah al kubra",
  "120363370364331767@g.us": "Madinaty",
  "120363368363163185@g.us": "Mansoura",
  "120363354291079894@g.us": "Shorouk city",
};
// تعريف الـ Schema لجدول Delivery
const deliverySchema = new mongoose.Schema({
  name: String,
  id: String,
  phone: String,
  zone: String,
  startTime: String,
  endTime: String,
  plannedTimeDifference: Object,
  status: String,
  breakTime: String,
  deliveries: Number,
  workedTime: String,
  utr: Number,
  numBreaks: Number,
  break: Object,
  breakTime: String,
  late: String,
});
const NotifiedRiderSchema = new mongoose.Schema({
  id: String,
  zone: String,
  plannedTimeDifference: Number,
  breakTime: String,
  late: String,
});
const cantWorkSchema = new mongoose.Schema({
  id: String,
  plannedTimeDifference: Number,
  zone: String,
  workedTime: String,
  breakTime: String,
  late: String,
});
const ZoneSchema = new mongoose.Schema({
  zoneName: String,
  gropeId: String,
});
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
  zone: String,
  repId: String,
  shiftStart: Date,
  shiftEnd: Date,
  totalHours: Number,
  isProcessed: Boolean,
  date: String,
});
const Shift = mongoose.model("Shift", shiftSchema);
const canWork = mongoose.model("canWork", canWorkSchema);
const NotifiedRider = mongoose.model("NotifiedRider", NotifiedRiderSchema);
const Delivery = mongoose.model("DeliveryLive", deliverySchema);
const CantWork = mongoose.model("CanNotWork", cantWorkSchema);
const daily = mongoose.model("DailyDelivery", deliverySchema);
const Zone = mongoose.model("Zone", ZoneSchema);
const Cookies = mongoose.model("Cookie", CookiesSchema);
let zones = {};
const client = new Client({
  authStrategy: new LocalAuth(),
});

// القوائم لتتبع البيانات
let canNotOpen = new Set();
const alreadyNotified = new Map();
const breakTimeNotified = new Map();
const late = new Map();
async function GetZones() {
  const zoneList = await Zone.find();
  for (const z of zoneList) {
    zones[z.zoneName] = z.gropeId;
  }
  return zones;
}
async function connectToDatabase() {
  try {
    console.log("Connecting to the database...");
    await mongoose.connect(
      "mongodb+srv://mo7ammedja3far:B2V4mXs12AsVZvbS@cluster0.7z5bs.mongodb.net/Speedy",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
  } catch (error) {
    console.error("Error connecting to the database:", error);
    process.exit(1);
  }
}

async function initializeNotifiedData() {
  try {
    const notifiedRiders = await NotifiedRider.find();
    const canNotOpenRiders = await CantWork.find();
    canNotOpenRiders.forEach((rider) => {
      canNotOpen.add(rider.id);
    });
    notifiedRiders.forEach((rider) => {
      alreadyNotified.set(rider.id, {
        plannedTimeDifference: rider.plannedTimeDifference,
        breakTime: rider.breakTime,
        late: rider.late,
      });

      const breakTimeMinutes = rider.breakTime
        ? parseInt(rider.breakTime.split(":")[0]) * 60 +
          parseInt(rider.breakTime.split(":")[1])
        : 0;
      const breakLateMinutes = rider.late
        ? parseInt(rider.late.split(":")[0]) * 60 +
          parseInt(rider.late.split(":")[1])
        : 0;
      breakTimeNotified.set(rider.id, breakTimeMinutes);
      late.set(rider.id, breakLateMinutes);
    });
    console.log("Loaded notified data from database.");
  } catch (error) {
    console.error("Error loading notified data:", error);
    process.exit(1);
  }
}

// إرسال إشعارات البريك
async function sendBreakTimeMessages(riders) {
  for (const rider of riders) {
    // حساب وقت البريك بالدقائق
    const breakTimeMinutes = rider.breakTime
      ? parseInt(rider.breakTime.split(":")[0]) * 60 +
        parseInt(rider.breakTime.split(":")[1])
      : 0;

    // حساب وقت التأخير بالدقائق
    const lateTimeMinutes = rider.late
      ? parseInt(rider.late.split(":")[0]) * 60 +
        parseInt(rider.late.split(":")[1])
      : 0;
    const previousBreakTime = breakTimeNotified.get(rider.id) || 0;
    if (
      breakTimeMinutes > previousBreakTime &&
      Math.floor(breakTimeMinutes / 15) > Math.floor(previousBreakTime / 15) &&
      breakTimeMinutes >= 30 &&
      !canNotOpen.has(rider.id)
    ) {
      const message = `
${rider.name.slice(0, -7).trim()}
ID: ${rider.id}
أخذ بريك ${breakTimeMinutes} دقيقة
الشيفت هيخلص
${convertTohh(rider.endTime)}
      `.trim();

      await client.sendMessage(zones[rider.zone], message);

      // تحديث وقت البريك الذي تم الإبلاغ عنه
      breakTimeNotified.set(rider.id, breakTimeMinutes);

      await NotifiedRider.updateOne(
        { id: rider.id },
        {
          $set: {
            id: rider.id,
            plannedTimeDifference: rider.plannedTimeDifference.total,
            zone: rider.zone,
            breakTime: rider.breakTime,
            late: rider.late,
          },
        },
        { upsert: true }
      );
    }

    // الحصول على آخر وقت تأخير تم إخطار المندوب به
    const previousLateTime = late.get(rider.id) || 0;

    // التحقق إذا تجاوز وقت التأخير مضاعفات 15 دقيقة وتم الإخطار
    if (
      lateTimeMinutes > previousLateTime &&
      Math.floor(lateTimeMinutes / 15) > Math.floor(previousLateTime / 15) &&
      lateTimeMinutes >= 15 &&
      !canNotOpen.has(rider.id)
    ) {
      const message = `
${rider.name.slice(0, -7).trim().slice(0, -7).trim()}
ID: ${rider.id}
${"https://wa.me/" + rider.phone.slice(1)}
متأخر ${lateTimeMinutes} دقيقة
الشيفت هيخلص
${convertTohh(rider.endTime)}
      `.trim();

      await client.sendMessage(zones[rider.zone], message);

      // تحديث وقت التأخير الذي تم الإبلاغ عنه
      late.set(rider.id, lateTimeMinutes);

      await NotifiedRider.updateOne(
        { id: rider.id },
        {
          $set: {
            id: rider.id,
            plannedTimeDifference: rider.plannedTimeDifference.total,
            breakTime: rider.breakTime,
            late: rider.late,
            zone: rider.zone,
          },
        },
        { upsert: true }
      );
    }
  }
}

const sendToMe = async (message) => {
  await client.sendMessage(`201124839303@c.us`, message);
};

let dataForAllZones = {};
async function checkAndSendMessages() {
  // console.log(canNotOpen.has("2382078"));
  const needToLogin = await canWork.find({ name: "need to ReLogin" });
  if (needToLogin[0].value) {
    await sendToMe("Needing To Login");
  }
  dataForAllZones = {};
  try {
    const riders = await Delivery.find();

    for (const e of riders) {
      dataForAllZones[e.zone] = {
        numOfRiders: (Number(dataForAllZones[e.zone]?.numOfRiders) || 0) + 1,
        expctedHoures:
          (Number(dataForAllZones[e.zone]?.expctedHoures) || 0) +
          Number(Math.abs(e.plannedTimeDifference.hoursBeforeMidnight)),
      };
    }
    console.log(dataForAllZones);
    for (const rider of riders) {
      const notifiedData = alreadyNotified.get(rider.id);
      if (rider.id == "2382078" || rider.id == "2430256") {
      }

      if (
        notifiedData &&
        notifiedData.plannedTimeDifference ===
          rider.plannedTimeDifference.total &&
        notifiedData.breakTime === rider.breakTime &&
        notifiedData.late === rider.late &&
        !canNotOpen.has(rider.id)
      ) {
        continue;
      }

      const plannedTime = rider.plannedTimeDifference.total;
      if (plannedTime < 7 && plannedTime != 0) {
        const message = `${rider.name.slice(0, -7).trim()} \nID: ${
          rider.id
        }\n شغال شفت ${
          rider.plannedTimeDifference.total
        }\nالشيفت هيخلص \n${convertTohh(rider.endTime)}`;
        await client.sendMessage(zones[rider.zone], message);

        alreadyNotified.set(rider.id, {
          plannedTimeDifference: rider.plannedTimeDifference.total,
          breakTime: rider.breakTime,

          late: rider.late,
        });
        await NotifiedRider.updateOne(
          { id: rider.id },
          {
            $set: {
              id: rider.id,
              plannedTimeDifference: rider.plannedTimeDifference.total,
              breakTime: rider.breakTime,
              late: rider.late,
              zone: rider.zone,
            },
          },
          { upsert: true }
        );
      }
    }

    await sendBreakTimeMessages(riders);
  } catch (error) {
    console.error("Error:", error);
  }
}

// تحويل الوقت إلى صيغة 12 ساعة
function convertTohh(time) {
  try {
    let [hours, minutes] = time.split(":").map((e) => +e);
    if (hours > 12) {
      hours = hours - 12;
      return `${hours < 10 ? "0" + hours : hours}:${
        minutes < 10 ? "0" + minutes : minutes
      } PM`;
    } else
      return `${hours < 10 ? "0" + hours : hours}:${
        minutes < 10 ? "0" + minutes : minutes
      } AM`;
  } catch (e) {
    console.log(e);
  }
}
client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});
client.on("ready", async () => {
  console.log("WhatsApp client is ready!");
  checkAndSendMessages();
  setInterval(checkAndSendMessages, 0.5 * 60 * 1000);
});
client.on("message", async (rsp) => {
  try {
    if (rsp.body.startsWith("Cookies")) {
      await handleCookiesMessage(rsp.body);
    } else if (rsp.body.startsWith("Live active")) {
      await handleLiveActive(rsp.from);
    } else if (rsp.body.startsWith("Stop")) {
      await handleCanNotOpenMessage(rsp.from, rsp.body);
    } else if (rsp.body.startsWith("Live day")) {
      await handleLiveDayMessage(rsp.from);
    } else if (rsp.body.startsWith("Live")) {
      await handleLiveMessage(rsp.body, rsp.from);
    } else if (rsp.body.startsWith("Total")) {
      await handleTotalMessage(rsp.from);
    } else if (rsp.body.startsWith("Run")) {
      await handleRunMessage(rsp.from);
    } else if (rsp.body.startsWith("Today total")) {
      await handleTodayTotalMessage(rsp.from);
    } else if (rsp.body.startsWith("Tomorrow total")) {
      await handleTomorrowTotalMessage(rsp.from);
    }
  } catch (error) {
    console.error("An error occurred while processing the message:", error);
    await client.sendMessage(
      rsp.from,
      "An error occurred while processing your request."
    );
  }
});
async function handleCookiesMessage(body) {
  try {
    const jsonString = body.split("\n").slice(1).join("");
    const cookies = JSON.parse(jsonString);

    for (const cookie of cookies) {
      const cookieData = {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
      };

      await Cookies.updateOne(
        { name: cookie.name },
        { $set: cookieData },
        { upsert: true }
      );
    }

    await canWork.updateOne(
      { name: "need to ReLogin" },
      { value: false },
      { upsert: true }
    );
  } catch (error) {
    console.error("Failed to parse message as JSON:", error);
  }
}
async function handleLiveMessage(body, from) {
  try {
    const ids = body.split("\n").slice(1);
    const riders = await Delivery.find();

    for (const id of ids) {
      let message = "Rider does not work now OR " + id + " is wrong ID!";
      const rider = riders.find((r) => r.id === id);

      if (rider) {
        message = `
${rider.name.slice(0, -7).trim()}
${rider.id}
Late: ${rider.late}
Break: ${rider.break.total} M
Start: ${convertTohh(rider.startTime)}
End: ${convertTohh(rider.endTime)}
UTR: ${rider.utr}
Shift: ${rider.plannedTimeDifference.total} H
        `.trim();
      }

      await client.sendMessage(from, message);
    }
  } catch (error) {
    console.error("Failed to process 'Live' message:", error);
  }
}
async function handleLiveDayMessage(from) {
  try {
    for (const [zone, data] of Object.entries(dataForAllZones)) {
      const message = `
Zone: ${zone}
Number of Riders: ${data.numOfRiders || 0}
Expected Hours: ${data.expctedHoures || 0}
      `.trim();

      await client.sendMessage(from, message);
    }
  } catch (error) {
    console.error("Failed to process 'Live day' message:", error);
  }
}
async function handleTotalMessage(from) {
  try {
    const dataForDay = await daily.find();

    if (!dataForDay || dataForDay.length === 0) {
      await client.sendMessage(from, "No data available for the day.");
      return;
    }

    const total = dataForDay.reduce((acc, rider) => {
      if (!rider.plannedTimeDifference) return acc;

      const zoneData = acc[rider.zone] || { numOfRiders: 0, expctedHoures: 0 };
      acc[rider.zone] = {
        numOfRiders: zoneData.numOfRiders + 1,
        expctedHoures:
          zoneData.expctedHoures +
          Math.abs(rider.plannedTimeDifference.hoursBeforeMidnight),
      };

      return acc;
    }, {});

    for (const [zone, data] of Object.entries(total)) {
      const message = `
Zone: ${zone}
Number of Riders: ${data.numOfRiders}
Expected Hours: ${data.expctedHoures.toFixed(2)}
      `.trim();

      await client.sendMessage(from, message);
    }
  } catch (error) {
    console.error("Failed to process 'Total' message:", error);
  }
}
async function handleRunMessage(from) {
  try {
    await client.sendMessage(from, "done");
    checkAndSendMessages();
  } catch (error) {
    console.error("Failed to process 'Run' message:", error);
  }
}
async function handleTodayTotalMessage(from) {
  try {
    const today = moment().startOf("day").format("YYYY-MM-DD");
    const total = await getTotalHoursByDateAndZone(today, info[from]);

    const message = `${info[from]} total for ${today} => ${total}`;
    await client.sendMessage(from, message);
  } catch (error) {
    console.error("Failed to process 'Today total' message:", error);
  }
} //صلح دول
async function handleTomorrowTotalMessage(from) {
  try {
    // الحصول على تاريخ الغد
    const tomorrow = moment().add(1, "day").startOf("day").format("YYYY-MM-DD");
    const total = await getTotalHoursByDateAndZone(tomorrow, info[from]);

    const message = `${info[from]} total for ${tomorrow} => ${total}`;
    await client.sendMessage(from, message);
  } catch (error) {
    console.error("Failed to process 'Tomorrow total' message:", error);
    await client.sendMessage(
      from,
      "An error occurred while processing your request."
    );
  }
}
async function handleLiveActive(from) {
  const riders = await Delivery.find();
  let message = "*Active now in " + info[from] + "*";
  for (const e of riders) {
    if (e.zone == info[from])
      message =
        message +
        `\n\nBreak:${e.break.total}|Late:${
          e.late
        }|Planned:${e.plannedTimeDifference.total.toFixed(2)}\n${e.id}\n*` +
        e.name.slice(0, -7).trim() +
        "*";
  }
  await client.sendMessage(from, message);
}
async function handleCanNotOpenMessage(from, body) {
  try {
    const ids = body.split("\n").slice(1);
    const riders = await Delivery.find();

    for (const id of ids) {
      const rider = riders.find((r) => r.id === id);
      if (rider) {
        message = `
DONE
${rider.id}
Late: ${rider.late}
WorkedTime: ${rider.workedTime}
Start: ${convertTohh(rider.startTime)}
End: ${convertTohh(rider.endTime)}
Shift: ${rider.plannedTimeDifference.total} H
        `.trim();
        canNotOpen.add(id);
        await CantWork.updateOne(
          { id: rider.id },
          {
            $set: {
              id: rider.id,
              plannedTimeDifference: rider.plannedTimeDifference.total,
              zone: rider.zone,
              workedTime: rider.workedTime,
              breakTime: rider.breakTime,
              late: rider.late,
            },
          },
          { upsert: true }
        );
      }

      await client.sendMessage(from, message);
    }
  } catch (error) {
    console.error("Failed to parse message as JSON:", error);
  }
}
async function main() {
  await connectToDatabase();
  await GetZones();
  await initializeNotifiedData();
  client.initialize();
}
main();
async function getTotalHoursByDateAndZone(date, zone) {
  const shifts = await Shift.find({ date: date, zone: zone });
  try {
    // جمع مجموع الساعات
    const totalHours = shifts.reduce((sum, shift) => sum + shift.totalHours, 0);
    return totalHours;
  } catch (error) {
    console.error("Error fetching total hours:", error);
    throw error;
  }
}
