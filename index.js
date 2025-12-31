require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");
const fs = require("fs");

// ---------- CLIENT ----------
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

// ---------- STORAGE ----------
const CONFIG_PATH = "./data/config.json";
const WARN_PATH = "./data/warnings.json";

const config = fs.existsSync(CONFIG_PATH)
  ? JSON.parse(fs.readFileSync(CONFIG_PATH))
  : {};

const warnings = fs.existsSync(WARN_PATH)
  ? JSON.parse(fs.readFileSync(WARN_PATH))
  : {};

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function saveWarnings() {
  fs.writeFileSync(WARN_PATH, JSON.stringify(warnings, null, 2));
}

// ---------- HELPERS ----------
function getGuildConfig(guildId) {
  return config[guildId] || {};
}

function getLogChannel(guild) {
  const id = getGuildConfig(guild.id).logChannelId;
  return id ? guild.channels.cache.get(id) : null;
}

function isMod(member) {
  return member.permissions.has(PermissionFlagsBits.ModerateMembers);
}

function addWarning(userId, reason, modId) {
  if (!warnings[userId]) warnings[userId] = [];
  warnings[userId].push({
    reason,
    moderator: modId,
    time: new Date().toISOString()
  });
  saveWarnings();
}

// ---------- READY ----------
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
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  ].map(c => c.toJSON());

  await client.application.commands.set(commands);
  console.log("🌍 Global slash commands synced");
});

// ---------- PREFIX ----------
client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  // -------- AUTOMOD --------
  const content = message.content.toLowerCase();

  if (BAD_WORDS.some(w => content.includes(w))) {
    await message.delete().catch(() => {});
    addWarning(message.author.id, "Bad language", client.user.id);

    const log = getLogChannel(message.guild);
    if (log) {
      const embed = new EmbedBuilder()
        .setTitle("AutoMod: Bad Word")
        .setDescription(`${message.author} used bad language`)
        .setColor(0xe74c3c)
        .setTimestamp();
      log.send({ embeds: [embed] });
    }
    return;
  }

  if (content.includes("discord.gg/")) {
    await message.delete().catch(() => {});
    addWarning(message.author.id, "Invite link", client.user.id);
    return;
  }
async function applyTimeout(member, minutes, reason) {
  const until = Date.now() + minutes * 60 * 1000;

  await member.timeout(until, reason).catch(() => {});
  
  const log = getLogChannel(member.guild);
  if (log) {
    const embed = new EmbedBuilder()
      .setTitle("User Timed Out")
      .setDescription(`${member} timed out for **${minutes} minutes**`)
      .addFields({ name: "Reason", value: reason })
      .setColor(0xe67e22)
      .setTimestamp();
    log.send({ embeds: [embed] });
  }
}

function getWarnCount(userId) {
  return warnings[userId]?.length || 0;
}
  // -------- PREFIX COMMANDS --------
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  if (cmd === "help") {
    return message.reply("Commands: `!help`, `/setlog`");
  }
});

// ---------- INTERACTIONS ----------
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "help") {
    return interaction.reply({
      content: "Use `!help` or moderation commands",
      ephemeral: true
    });
  }

  if (interaction.commandName === "setlog") {
    const channel = interaction.options.getChannel("channel");
    config[interaction.guild.id] = {
      ...getGuildConfig(interaction.guild.id),
      logChannelId: channel.id
    };
    saveConfig();
    return interaction.reply({
      content: `✅ Log channel set to ${channel}`,
      ephemeral: true
    });
  }
});

// ---------- LOGIN ----------
client.login(process.env.DISCORD_TOKEN);
