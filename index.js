require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
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

// ---------------- CLIENT ----------------
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
const warnings = JSON.parse(fs.existsSync("warnings.json") ? fs.readFileSync("warnings.json") : "{}");

// ---------------- UTILS ----------------
function saveWarnings() {
  fs.writeFileSync("warnings.json", JSON.stringify(warnings, null, 2));
}

function isMod(member) {
  return member.permissions.has(PermissionFlagsBits.ModerateMembers);
}

// ---------------- READY ----------------
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // GLOBAL SLASH COMMANDS
  const commands = [
    new SlashCommandBuilder().setName("help").setDescription("Show help"),
    new SlashCommandBuilder()
      .setName("userinfo")
      .setDescription("User info")
      .addUserOption(o => o.setName("user").setDescription("Target")),
    new SlashCommandBuilder()
      .setName("moderate")
      .setDescription("Open moderation panel")
      .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
  ].map(c => c.toJSON());

  await client.application.commands.set(commands);
  console.log("🌍 Global slash commands synced");
});

// ---------------- PREFIX COMMANDS ----------------
client.on("messageCreate", async message => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  if (cmd === "help") {
    return message.reply("**Commands:** `!help`, `!userinfo @user`, `/moderate`");
  }

  if (cmd === "userinfo") {
    const user = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setTitle(`User Info`)
      .setDescription(`${user.tag}\nID: ${user.id}`)
      .setThumbnail(user.displayAvatarURL());
    return message.reply({ embeds: [embed] });
  }
});

// ---------------- INTERACTIONS (ONE ONLY) ----------------
client.on("interactionCreate", async interaction => {
  // ---------- SLASH ----------
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "help") {
      return interaction.reply({ content: "Use `!help` or `/moderate`", ephemeral: true });
    }

    if (interaction.commandName === "userinfo") {
      const user = interaction.options.getUser("user") || interaction.user;
      const embed = new EmbedBuilder()
        .setTitle("User Info")
        .setDescription(`${user.tag}\nID: ${user.id}`)
        .setThumbnail(user.displayAvatarURL());
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === "moderate") {
      const target = interaction.options.getMember("user");
      if (!isMod(interaction.member))
        return interaction.reply({ content: "❌ No permission", ephemeral: true });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`warn_${target.id}`).setLabel("Warn").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`kick_${target.id}`).setLabel("Kick").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ban_${target.id}`).setLabel("Ban").setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setTitle("Moderation Panel")
        .setDescription(`Target: ${target.user.tag}`);

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
  }

  // ---------- BUTTONS ----------
  if (interaction.isButton()) {
    const [action, userId] = interaction.customId.split("_");
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) return interaction.reply({ content: "User not found", ephemeral: true });

    if (!isMod(interaction.member))
      return interaction.reply({ content: "❌ No permission", ephemeral: true });

    // WARN
    if (action === "warn") {
      const modal = new ModalBuilder()
        .setCustomId(`warnmodal_${member.id}`)
        .setTitle("Warn User");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Reason")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }

    if (action === "kick") {
      await member.kick("Kicked via panel");
      return interaction.reply({ content: "✅ User kicked", ephemeral: true });
    }

    if (action === "ban") {
      await member.ban({ reason: "Banned via panel" });
      return interaction.reply({ content: "✅ User banned", ephemeral: true });
    }
  }

  // ---------- MODAL ----------
  if (interaction.isModalSubmit()) {
    if (!interaction.customId.startsWith("warnmodal_")) return;
    const userId = interaction.customId.split("_")[1];
    const reason = interaction.fields.getTextInputValue("reason");

    warnings[userId] = warnings[userId] || [];
    warnings[userId].push({
      moderator: interaction.user.id,
      reason,
      time: new Date().toISOString()
    });
    saveWarnings();

    return interaction.reply({ content: "⚠️ Warning issued", ephemeral: true });
  }
});

// ---------------- LOGIN ----------------
client.login(process.env.DISCORD_TOKEN);
