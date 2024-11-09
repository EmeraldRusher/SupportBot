const fs = require("fs");
const Discord = require("discord.js");
const yaml = require("js-yaml");

const supportbot = yaml.load(fs.readFileSync("./Configs/supportbot.yml", "utf8"));
const cmdconfig = yaml.load(fs.readFileSync("./Configs/commands.yml", "utf8"));
const msgconfig = yaml.load(fs.readFileSync("./Configs/messages.yml", "utf8"));

const Command = require("../Structures/Command.js");

module.exports = new Command({
  name: cmdconfig.CloseTicket.Command,
  description: cmdconfig.CloseTicket.Description,
  type: Discord.ApplicationCommandType.ChatInput,
  options: [
    {
      name: "reason",
      description: "Ticket Close Reason",
      type: Discord.ApplicationCommandOptionType.String,
    },
  ],
  permissions: cmdconfig.CloseTicket.Permission,

  async run(interaction) {
    const { getRole, getChannel } = interaction.client;

    if (supportbot.Ticket.Close.StaffOnly) {
      let SupportStaff = await getRole(supportbot.Roles.StaffMember.Staff, interaction.guild);
      let Admin = await getRole(supportbot.Roles.StaffMember.Admin, interaction.guild);

      if (!SupportStaff || !Admin) {
        return interaction.reply("Some roles seem to be missing! Please check for errors when starting the bot.");
      }

      const NoPerms = new Discord.EmbedBuilder()
        .setTitle("Invalid Permissions!")
        .setDescription(`${msgconfig.Error.IncorrectPerms}\n\nRole Required: \`${supportbot.Roles.StaffMember.Staff}\` or \`${supportbot.Roles.StaffMember.Admin}\``)
        .setColor(supportbot.Embed.Colours.Warn); 

      if (!interaction.member.roles.cache.has(SupportStaff.id) && !interaction.member.roles.cache.has(Admin.id)) {
        return interaction.reply({ embeds: [NoPerms] });
      }
    }

    if (
      (supportbot.Ticket.TicketType === "threads" && interaction.channel.type !== Discord.ChannelType.PrivateThread) ||
      (supportbot.Ticket.TicketType === "channels" && interaction.channel.type !== Discord.ChannelType.GuildText)
    ) {
      const NotTicketChannel = new Discord.EmbedBuilder()
        .setTitle("Invalid Channel!")
        .setDescription(`This command can only be used in a ${supportbot.Ticket.TicketType === "threads" ? "ticket thread" : "ticket channel"}.`)
        .setColor(supportbot.Embed.Colours.Warn); // Ensure valid color

      return interaction.reply({ embeds: [NotTicketChannel], ephemeral: true });
    }

    await interaction.deferReply(); // Deferring to avoid double replies

    // Reading TicketData.json once for efficiency
    let tickets;
    try {
      tickets = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
    } catch (err) {
      console.error('Error reading ticket data file:', err);
      return interaction.followUp({ content: "There was an error loading ticket data." });
    }

    let TicketData = tickets.tickets.findIndex((t) => t.id === interaction.channel.id);
    let ticket = tickets.tickets[TicketData];

    if (TicketData === -1) {
      const Exists = new Discord.EmbedBuilder()
        .setTitle("No Ticket Found!")
        .setDescription(msgconfig.Error.NoValidTicket)
        .setColor(supportbot.Embed.Colours.Warn); // Ensure valid color
      return interaction.followUp({ embeds: [Exists] });
    }

    let reason = interaction.options?.getString("reason") || "No Reason Provided.";

    if (supportbot.Ticket.ReviewSystem.Enabled) {
      const rating = await collectReviewRating(interaction);
      const comment = await collectReviewComment(interaction);

      const reviewChannel = await getChannel(supportbot.Ticket.ReviewSystem.Channel, interaction.guild);
      const reviewer = supportbot.Ticket.ClaimTickets ? `<@${ticket.claimedBy}>` : null;

      const reviewEmbed = new Discord.EmbedBuilder()
        .setTitle(msgconfig.ReviewSystem.ReviewEmbed.Title)
        .addFields(
          {
            name: msgconfig.ReviewSystem.ReviewEmbed.RatingTitle,
            value: `${msgconfig.ReviewSystem.ReviewEmbed.ReviewEmoji.repeat(rating)}`,
            inline: false
          },
          {
            name: msgconfig.ReviewSystem.ReviewEmbed.CommentTitle,
            value: `\`\`\`${comment}\`\`\``,
            inline: false
          }
        )
        .setColor(msgconfig.ReviewSystem.ReviewEmbed.Color);

      if (supportbot.Ticket.ClaimTickets.Enabled) {
        reviewEmbed.setDescription(
          `**${msgconfig.ReviewSystem.ReviewEmbed.ReviewedStaffTitle}** ${reviewer}\n**${msgconfig.ReviewSystem.ReviewEmbed.ReviewedByTitle}** <@${interaction.user.id}>` || `N/A`
        );
      } else {
        reviewEmbed.setDescription(
          `**${msgconfig.ReviewSystem.ReviewEmbed.ReviewedByTitle}** <@${interaction.user.id}>`
        );
      }

      if (reviewChannel) {
        await reviewChannel.send({ embeds: [reviewEmbed] });
      }

      if (!interaction.replied && !interaction.deferred) {
        await interaction.followUp({ embeds: [reviewEmbed] });
      }

      await handleCloseTicket(interaction, reason, ticket, TicketData);
    } else {
      await handleCloseTicket(interaction, reason, ticket, TicketData);
    }
  },
});

async function collectReviewRating(interaction) {
  const reviewPrompt = new Discord.EmbedBuilder()
    .setTitle(msgconfig.ReviewSystem.Rate.Title)
    .setDescription(msgconfig.ReviewSystem.Rate.Description)
    .setColor(supportbot.Embed.Colours.General); // Ensure valid color

  const stars = new Discord.ActionRowBuilder().addComponents(
    new Discord.StringSelectMenuBuilder()
      .setCustomId("starRating")
      .setPlaceholder("Select a rating")
      .addOptions([
        { label: msgconfig.ReviewSystem.Stars.One, value: "1" },
        { label: msgconfig.ReviewSystem.Stars.Two, value: "2" },
        { label: msgconfig.ReviewSystem.Stars.Three, value: "3" },
        { label: msgconfig.ReviewSystem.Stars.Four, value: "4" },
        { label: msgconfig.ReviewSystem.Stars.Five, value: "5" },
      ])
  );

  await interaction.followUp({
    embeds: [reviewPrompt],
    components: [stars],
    ephemeral: true,
  });

  const starRating = await interaction.channel.awaitMessageComponent({
    componentType: Discord.ComponentType.StringSelect,
    filter: (i) => i.customId === "starRating" && i.user.id === interaction.user.id,
    time: 30000,
  });

  await starRating.deferUpdate();
  return starRating.values[0];
}

async function collectReviewComment(interaction) {
  const commentPrompt = new Discord.EmbedBuilder()
    .setTitle(msgconfig.ReviewSystem.Comment.Title)
    .setDescription(msgconfig.ReviewSystem.Comment.Description)
    .setColor(supportbot.Embed.Colours.General); // Ensure valid color

  await interaction.followUp({
    embeds: [commentPrompt],
    ephemeral: true,
  });

  const filter = (response) => response.author.id === interaction.user.id;
  const commentCollection = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000 });
  const comment = commentCollection.first()?.content;
  return comment && comment.toLowerCase() !== "no" ? comment : "No Comment Provided";
}

async function handleCloseTicket(interaction, reason, ticket, TicketData) {
  const { getChannel } = interaction.client;

  let tickets = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
  let tUser = interaction.client.users.cache.get(ticket.user);
  let transcriptChannel = await getChannel(supportbot.Ticket.Log.TicketDataLog, interaction.guild);

  if (!transcriptChannel)
    return console.log("Ticket Log Missing");

  try {
    tickets.tickets[TicketData].open = false;
    fs.writeFileSync("./Data/TicketData.json", JSON.stringify(tickets, null, 4));

    const transcriptEmbed = new Discord.EmbedBuilder()
      .setTitle(msgconfig.TicketLog.Title)
      .setColor(msgconfig.TicketLog.Colour) // Ensure valid color
      .setFooter({ text: supportbot.Embed.Footer, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(`> **Ticket:** ${interaction.channel.name} (\`${interaction.channel.id}\`)\n> **User:** ${tUser?.username || "N/A"}#${tUser?.discriminator || "N/A"} (\`${tUser?.id || ticket.user}\`)\n> **Closed by:** <@${interaction.user.id}>`)
      .addFields({ name: "Reason", value: `\`\`\`${reason}\`\`\``, inline: true });

    let msgs = await interaction.channel.messages.fetch({ limit: 100 });
    let html = createTranscriptHTML(interaction, msgs);

    const fileName = `${interaction.channel.name}.html`;
    let file = new Discord.AttachmentBuilder(Buffer.from(html), { name: `SPOILER_${fileName}` });

    transcriptChannel.send({
      embeds: [transcriptEmbed],
      files: [file],
    });
  } catch (err) {
    console.log("Error closing ticket:", err);
  }

  await interaction.channel.delete();
}

function createTranscriptHTML(interaction, msgs) {
  let html = `
  <html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      .message { padding: 10px; margin: 5px 0; border: 1px solid #ddd; }
      .username { font-weight: bold; }
    </style>
  </head>
  <body>
    <h1>Ticket Transcript</h1>
    <h2>Ticket: ${interaction.channel.name}</h2>
    <h3>User: ${interaction.user.tag}</h3>
    <div id="messages">
  `;

  msgs.reverse().forEach((msg) => {
    html += `
    <div class="message">
      <span class="username">${msg.author.tag}</span>: ${msg.content}
    </div>
    `;
  });

  html += `
    </div>
  </body>
  </html>
  `;
  return html;
}
