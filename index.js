require("dotenv").config();
const fs = require("fs");
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
  ChannelType
} = require("discord.js");
const http = require("http");

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("🟢 Discord bot is running.");
}).listen(PORT, () => {
  console.log(`🌐 Web service running on port ${PORT}`);
});
if (!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN missing");

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

/* ================= CONSTANTS ================= */
const PREFIX = "!";
const BACKUP_ROLE = "1451114146988036232";
const CRIMEPASS_ROLE = "1451114147319119950";
const CRIME_ADMIN_ROLES = [
  "1451114147335901331",
  "1451114147335901332",
  "1451114147335901334"
];
const CRIME_CATEGORY = "1451114152008351873";

/* ================= STORAGE ================= */
if (!fs.existsSync("./data")) fs.mkdirSync("./data");

const WARN_FILE = "./data/warnings.json";
const warnings = fs.existsSync(WARN_FILE)
  ? JSON.parse(fs.readFileSync(WARN_FILE))
  : {};

const saveWarns = () =>
  fs.writeFileSync(WARN_FILE, JSON.stringify(warnings, null, 2));

const warnCount = id => warnings[id]?.length || 0;

/* ================= READY ================= */
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("acfmodpanel")
      .setDescription("Open ACF moderation panel")
      .addUserOption(o =>
        o.setName("user").setDescription("Target").setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName("backup")
      .setDescription("Request backup")
      .addStringOption(o =>
        o.setName("location").setDescription("Backup location").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("crimepass")
      .setDescription("Request crime pass (1 hour)")
  ].map(c => c.toJSON());

  await client.application.commands.set(commands);
  console.log("🌍 Slash commands registered");
});

/* ================= PREFIX BACKUP ================= */
client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;
  if (!msg.content.startsWith(`${PREFIX}backup`)) return;

  const location = msg.content.slice(8).trim();
  if (!location) return msg.reply("❌ Location required");

  const m = await msg.channel.send(
    `<@&${BACKUP_ROLE}>\n📦 **BACKUP REQUEST**\n\n📍 Location: **${location}**\n👤 Requested by: ${msg.author}\n\nReact with ✅ if you can give backup`
  );
  await m.react("✅");
  await m.react("❌");
});

/* ================= INTERACTIONS ================= */
client.on("interactionCreate", async interaction => {

  /* ---------- ACF MOD PANEL ---------- */
  if (interaction.isChatInputCommand() && interaction.commandName === "acfmodpanel") {
    const target = interaction.options.getMember("user");

    const embed = new EmbedBuilder()
      .setTitle(`Moderation Panel for ${target.user.username}`)
      .addFields(
        { name: "User ID", value: target.id },
        { name: "Current Warnings", value: `${warnCount(target.id)}` }
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setColor(0xffa500);

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`warn_${target.id}`).setLabel("Warn").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`kick_${target.id}`).setLabel("Kick").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ban_${target.id}`).setLabel("Ban").setStyle(ButtonStyle.Danger)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`timeout_${target.id}`).setLabel("Timeout (10m)").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`untimeout_${target.id}`).setLabel("Remove Timeout").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`removewarn_${target.id}`).setLabel("Remove 1 Warn").setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
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
      await member.kick();
      return interaction.reply({ content: "✅ Kicked", ephemeral: true });
    }

    if (action === "ban") {
      await member.ban();
      return interaction.reply({ content: "✅ Banned", ephemeral: true });
    }

    if (action === "timeout") {
      await member.timeout(10 * 60 * 1000);
      return interaction.reply({ content: "⏳ Timed out (10 minutes)", ephemeral: true });
    }

    if (action === "untimeout") {
      await member.timeout(null);
      return interaction.reply({ content: "✅ Timeout removed", ephemeral: true });
    }

    if (action === "removewarn") {
      if (warnings[id]?.length) warnings[id].pop();
      saveWarns();
      return interaction.reply({ content: "➖ Removed 1 warning", ephemeral: true });
    }
  }

  /* ---------- WARN MODAL ---------- */
  if (interaction.isModalSubmit()) {
    const id = interaction.customId.split("_")[1];
    if (!warnings[id]) warnings[id] = [];
    warnings[id].push({ reason: interaction.fields.getTextInputValue("reason") });
    saveWarns();
    return interaction.reply({ content: "⚠ Warning issued", ephemeral: true });
  }

  /* ---------- BACKUP SLASH ---------- */
  if (interaction.isChatInputCommand() && interaction.commandName === "backup") {
    const loc = interaction.options.getString("location");
    const m = await interaction.channel.send(
      `<@&${BACKUP_ROLE}>\n📦 **BACKUP REQUEST**\n\n📍 Location: **${loc}**\n👤 Requested by: ${interaction.user}\n\nReact with ✅ if you can give backup`
    );
    await m.react("✅");
    await m.react("❌");
    return interaction.reply({ content: "✅ Backup request sent", ephemeral: true });
  }

  /* ---------- CRIMEPASS ---------- */
  if (interaction.isChatInputCommand() && interaction.commandName === "crimepass") {
    if (!interaction.member.roles.cache.has(CRIMEPASS_ROLE))
      return interaction.reply({ content: "❌ No permission", ephemeral: true });

    const channel = await interaction.guild.channels.create({
      name: `crimepass-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: CRIME_CATEGORY,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: ["ViewChannel"] },
        { id: interaction.user.id, allow: ["ViewChannel", "SendMessages"] }
      ]
    });

    const embed = new EmbedBuilder()
      .setTitle("🟥 CRIME PASS REQUEST")
      .setDescription(
        `User: ${interaction.user}\n\nWants to become a Criminal for 1 hour.\n⏳ Admin Action Required`
      )
      .setColor(0xff0000);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("crime_accept").setLabel("Accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("crime_deny").setLabel("Deny").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("crime_close").setLabel("Close Ticket").setStyle(ButtonStyle.Secondary)
    );

    await channel.send({
      content: CRIME_ADMIN_ROLES.map(r => `<@&${r}>`).join(" "),
      embeds: [embed],
      components: [row]
    });

    return interaction.reply({ content: "✅ Crimepass ticket created", ephemeral: true });
  }
});

/* ================= LOGIN ================= */
client.login(process.env.DISCORD_TOKEN);
