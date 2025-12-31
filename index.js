require("dotenv").config();
const fs = require("fs");
const http = require("http");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActivityType
} = require("discord.js");

/* ================= BASIC WEB SERVER (RENDER) ================= */
const PORT = process.env.PORT || 3000;
http.createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ACF Bot Running");
}).listen(PORT);

/* ================= CLIENT ================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

if (!process.env.DISCORD_TOKEN) {
  throw new Error("DISCORD_TOKEN missing");
}

/* ================= CONSTANTS ================= */
const BAD_WORDS = ["fuck", "shit", "bitch", "asshole"];
const LOG_FILE = "./data/logs.json";
const WARN_FILE = "./data/warnings.json";

if (!fs.existsSync("./data")) fs.mkdirSync("./data");

/* ================= STORAGE ================= */
const warnings = fs.existsSync(WARN_FILE)
  ? JSON.parse(fs.readFileSync(WARN_FILE))
  : {};

const saveWarnings = () =>
  fs.writeFileSync(WARN_FILE, JSON.stringify(warnings, null, 2));

const getWarns = id => warnings[id]?.length || 0;

/* ================= READY ================= */
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // 🔥 FORCE PRESENCE (BLOCKS BOTGHOST STATUS)
  client.user.setPresence({
    activities: [
      {
        name: "Alpha Contingency Force",
        type: ActivityType.Watching
      }
    ],
    status: "online"
  });

  // Slash commands (GLOBAL)
  const commands = [
    new SlashCommandBuilder()
      .setName("acfmodpanel")
      .setDescription("Open ACF moderation panel")
      .addUserOption(o =>
        o.setName("user").setDescription("Target user").setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  ].map(c => c.toJSON());

  await client.application.commands.set(commands);
  console.log("🌍 Slash commands synced");
});

/* ================= AUTOMOD ================= */
client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const content = message.content.toLowerCase();

  // Bad words
  if (BAD_WORDS.some(w => content.includes(w))) {
    await message.delete().catch(() => {});
    if (!warnings[message.author.id]) warnings[message.author.id] = [];
    warnings[message.author.id].push({
      reason: "AutoMod: bad language",
      time: new Date().toISOString()
    });
    saveWarnings();

    const count = getWarns(message.author.id);
    if (count === 3) {
      await message.member.timeout(10 * 60 * 1000, "3 AutoMod warnings");
    }
  }

  // Discord invite
  if (content.includes("discord.gg/")) {
    await message.delete().catch(() => {});
  }
});

/* ================= INTERACTIONS ================= */
client.on("interactionCreate", async interaction => {

  /* ---------- MOD PANEL ---------- */
  if (interaction.isChatInputCommand() && interaction.commandName === "acfmodpanel") {
    const target = interaction.options.getMember("user");

    const embed = new EmbedBuilder()
      .setTitle("ACF Moderation Panel")
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: "User", value: `${target}` },
        { name: "User ID", value: target.id },
        { name: "Warnings", value: `${getWarns(target.id)}` }
      )
      .setColor(0xffa500);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`warn_${target.id}`)
        .setLabel("Warn")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`timeout_${target.id}`)
        .setLabel("Timeout (10m)")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`kick_${target.id}`)
        .setLabel("Kick")
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  }

  /* ---------- MOD PANEL BUTTONS ---------- */
  if (interaction.isButton()) {
    const [action, id] = interaction.customId.split("_");
    const member = await interaction.guild.members.fetch(id).catch(() => null);
    if (!member) return;

    // WARN
    if (action === "warn") {
      const modal = new ModalBuilder()
        .setCustomId(`warnmodal_${id}`)
        .setTitle("Warn User")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Reason")
              .setStyle(TextInputStyle.Paragraph)
          )
        );
      return interaction.showModal(modal);
    }

    // TIMEOUT
    if (action === "timeout") {
      await member.timeout(10 * 60 * 1000, "Timed out via mod panel");
      return interaction.reply({
        content: "⏳ User timed out for 10 minutes",
        ephemeral: true
      });
    }

    // KICK
    if (action === "kick") {
      await member.kick("Kicked via mod panel");
      return interaction.reply({
        content: "👢 User kicked",
        ephemeral: true
      });
    }
  }

  /* ---------- WARN MODAL ---------- */
  if (interaction.isModalSubmit()) {
    const id = interaction.customId.split("_")[1];
    const reason = interaction.fields.getTextInputValue("reason");

    if (!warnings[id]) warnings[id] = [];
    warnings[id].push({
      reason,
      moderator: interaction.user.id,
      time: new Date().toISOString()
    });
    saveWarnings();

    return interaction.reply({
      content: "⚠️ Warning issued",
      ephemeral: true
    });
  }
});

/* ================= LOGIN ================= */
client.login(process.env.DISCORD_TOKEN);
