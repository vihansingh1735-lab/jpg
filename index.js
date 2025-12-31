require("dotenv").config();

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
  PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");

/* ================= CLIENT ================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const PREFIX = "!";
const BAD_WORDS = ["fuck", "shit", "bitch", "asshole", "nigger", "faggot"];

/* ================= STORAGE ================= */
const CONFIG_PATH = "./data/config.json";
const WARN_PATH = "./data/warnings.json";

if (!fs.existsSync("./data")) fs.mkdirSync("./data");

const config = fs.existsSync(CONFIG_PATH)
  ? JSON.parse(fs.readFileSync(CONFIG_PATH))
  : {};

const warnings = fs.existsSync(WARN_PATH)
  ? JSON.parse(fs.readFileSync(WARN_PATH))
  : {};

const saveConfig = () =>
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

const saveWarnings = () =>
  fs.writeFileSync(WARN_PATH, JSON.stringify(warnings, null, 2));

/* ================= HELPERS ================= */
const getGuildConfig = g => config[g.id] || {};
const isMod = m =>
  m.permissions.has(PermissionFlagsBits.ModerateMembers) ||
  m.permissions.has(PermissionFlagsBits.Administrator);

const getLogChannel = g => {
  const id = getGuildConfig(g).logChannelId;
  return id ? g.channels.cache.get(id) : null;
};

function addWarning(userId, reason, modId) {
  if (!warnings[userId]) warnings[userId] = [];
  warnings[userId].push({
    reason,
    moderator: modId,
    time: new Date().toISOString()
  });
  saveWarnings();
}

const getWarnCount = id => warnings[id]?.length || 0;

async function applyTimeout(member, minutes, reason) {
  await member
    .timeout(minutes * 60 * 1000, reason)
    .catch(() => {});

  const log = getLogChannel(member.guild);
  if (log) {
    log.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("User Timed Out")
          .setDescription(`${member} for **${minutes} minutes**`)
          .addFields({ name: "Reason", value: reason })
          .setColor(0xe67e22)
          .setTimestamp()
      ]
    });
  }
}

/* ================= READY ================= */
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Show help"),

    new SlashCommandBuilder()
      .setName("setlog")
      .setDescription("Set log channel")
      .addChannelOption(o =>
        o.setName("channel").setDescription("Log channel").setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName("moderate")
      .setDescription("Open moderation panel")
      .addUserOption(o =>
        o.setName("user").setDescription("Target").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("timeout")
      .setDescription("Timeout a user")
      .addUserOption(o => o.setName("user").setRequired(true))
      .addIntegerOption(o => o.setName("minutes").setRequired(true))
      .addStringOption(o => o.setName("reason"))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  ].map(c => c.toJSON());

  await client.application.commands.set(commands);
  console.log("🌍 Slash commands synced");
});

/* ================= MESSAGE (PREFIX + AUTOMOD) ================= */
client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const content = message.content.toLowerCase();

  if (BAD_WORDS.some(w => content.includes(w))) {
    await message.delete().catch(() => {});
    addWarning(message.author.id, "Bad language", client.user.id);
  }

  if (content.includes("discord.gg/")) {
    await message.delete().catch(() => {});
    addWarning(message.author.id, "Invite link", client.user.id);
  }

  const warns = getWarnCount(message.author.id);
  if (warns === 3) await applyTimeout(message.member, 15, "3 warnings");
  if (warns === 5) await applyTimeout(message.member, 1440, "5 warnings");

  if (!message.content.startsWith(PREFIX)) return;
  const cmd = message.content.slice(PREFIX.length).toLowerCase();
  if (cmd === "help") message.reply("Use `/moderate` or `/help`");
});

/* ================= INTERACTIONS ================= */
client.on("interactionCreate", async interaction => {

  /* ---------- SLASH ---------- */
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "help")
      return interaction.reply({
        content: "Prefix: `!help`\nSlash: `/moderate`",
        ephemeral: true
      });

    if (interaction.commandName === "setlog") {
      config[interaction.guild.id] = {
        logChannelId: interaction.options.getChannel("channel").id
      };
      saveConfig();
      return interaction.reply({ content: "✅ Log channel set", ephemeral: true });
    }

    if (interaction.commandName === "timeout") {
      if (!isMod(interaction.member))
        return interaction.reply({ content: "❌ No permission", ephemeral: true });

      await applyTimeout(
        interaction.options.getMember("user"),
        interaction.options.getInteger("minutes"),
        interaction.options.getString("reason") || "No reason"
      );

      return interaction.reply({ content: "✅ User timed out", ephemeral: true });
    }

    if (interaction.commandName === "moderate") {
      if (!isMod(interaction.member))
        return interaction.reply({ content: "❌ No permission", ephemeral: true });

      const target = interaction.options.getMember("user");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`warn_${target.id}`)
          .setLabel("Warn")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`kick_${target.id}`)
          .setLabel("Kick")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId(`ban_${target.id}`)
          .setLabel("Ban")
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Moderation Panel")
            .setDescription(`${target}`)
        ],
        components: [row],
        ephemeral: true
      });
    }
  }

  /* ---------- BUTTONS ---------- */
  if (interaction.isButton()) {
    const [action, id] = interaction.customId.split("_");
    const member = await interaction.guild.members.fetch(id);

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

    if (action === "kick") {
      await member.kick("Kicked via panel");
      return interaction.reply({ content: "✅ Kicked", ephemeral: true });
    }

    if (action === "ban") {
      await member.ban({ reason: "Banned via panel" });
      return interaction.reply({ content: "✅ Banned", ephemeral: true });
    }
  }

  /* ---------- MODAL ---------- */
  if (interaction.isModalSubmit()) {
    const id = interaction.customId.split("_")[1];
    addWarning(
      id,
      interaction.fields.getTextInputValue("reason"),
      interaction.user.id
    );
    return interaction.reply({ content: "⚠️ Warning issued", ephemeral: true });
  }
});
console.log("TOKEN CHECK:", process.env.DISCORD_TOKEN);
/* ================= LOGIN ================= */
client.login(process.env.DISCORD_TOKEN);
