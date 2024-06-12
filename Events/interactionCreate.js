const fs = require("fs");
const Discord = require("discord.js");
const yaml = require("js-yaml");

const supportbot = yaml.load(fs.readFileSync("./Configs/supportbot.yml", "utf8"));
const cmdconfig = yaml.load(fs.readFileSync("./Configs/commands.yml", "utf8"));
const msgconfig = yaml.load(fs.readFileSync("./Configs/messages.yml", "utf8"));

const Event = require("../Structures/Event.js");

module.exports = new Event("interactionCreate", async (client, interaction) => {
  if (interaction.type == Discord.InteractionType.ApplicationCommand) {
    const command = client.commands.find(
      (cmd) => cmd.name.toLowerCase() === interaction.commandName
    );

    if (interaction.user.bot || !interaction.guild) return;

    const NotValid = new Discord.EmbedBuilder()
      .setDescription(`:x: \`Invalid Command\` `)
      .setColor(supportbot.Embed.Colours.Error);

    if (!command)
      return interaction.reply({
        embeds: [NotValid],
      });

    const permission = interaction.member.permissions.has(command.permissions);

    const ValidPerms = new Discord.EmbedBuilder()
      .setDescription(
        "> :x: `Invalid Permissions` Do you have the correct permissions to execute this command?"
      )
      .setColor(supportbot.Embed.Colours.Error);

    if (!permission)
      return interaction.reply({
        embeds: [ValidPerms],
      });
    command.run(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "ticketcontrolpanel") {
      const selectedOption = interaction.values[0];
      const { getRole, getChannel } = interaction.client;
      switch (selectedOption) {
        case "ticketadduser":
          const AddUserThreadTicket = new Discord.EmbedBuilder()
            .setTitle(`${msgconfig.Ticket.AddUserToTicket}`)
            .setDescription(`${msgconfig.Ticket.AddUserToTicket}`)
            .setColor(supportbot.Embed.Colours.General);

          await interaction.reply({
            embeds: [AddUserThreadTicket],
            ephemeral: true,
          });
          break;

        case "ticketremoveuser":
          await removeUserFromThread(interaction);
          break;

        case "ticketclose":
          const closeCommand = client.commands.get(cmdconfig.CloseTicket.Command);
          if (closeCommand) {
            closeCommand.run(interaction);
          } else {
            console.error("[X] Close Command Not Found");
          }
          break;

        case "ticketremoveuser":
          await removeUserFromThread(interaction);
          break;
          
        case "enableinvites":
          await handleInvites(interaction, true);
          break;

        case "disableinvites":
          await handleInvites(interaction, false);
          break;
      }
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'createticket') {
      try {
        const cmd = client.commands.get(cmdconfig.OpenTicket.Command);
        if (!cmd) return;
        cmd.run(interaction);
      } catch (error) {
        console.error("Error executing the ticket command:", error);
        await interaction.reply({
          content: "An error occurred while creating the ticket.",
          ephemeral: true,
        });
      }
    }

    if (interaction.customId === "openticket") {
      try {
        const cmd = client.commands.get(cmdconfig.OpenTicket);
        if (!cmd) return;
        cmd.run(interaction);
      } catch (error) {
        console.error(error);
      }
    }

    if (interaction.customId.startsWith('claimticket-')) {
      const ticketChannelId = interaction.customId.split('-')[1];
      const ticketChannel = interaction.guild.channels.cache.get(ticketChannelId);
      if (!ticketChannel) {
        return interaction.reply({
          content: "Ticket channel not found.",
          ephemeral: true,
        });
      }

      const { getRole, getChannel } = interaction.client;
      const Staff = await getRole(supportbot.Roles.StaffMember.Staff, interaction.guild);
      const Admin = await getRole(supportbot.Roles.StaffMember.Admin, interaction.guild);

      const RolePerms = new Discord.EmbedBuilder()
        .setTitle("Invalid Permissions!")
        .setDescription(
          `${msgconfig.Error.IncorrectPerms}\n\nRole Required: \`${supportbot.Roles.StaffMember.Staff}\` or \`${supportbot.Roles.StaffMember.Admin}\``
        )
        .setColor(supportbot.Embed.Colours.Warn);

      if (!Staff || !Admin) {
        return interaction.reply({
          embeds: [RolePerms],
          ephemeral: true,
        });
      }

      const NoPermsClaim = new Discord.EmbedBuilder()
        .setTitle(msgconfig.Ticket.ClaimTickets.NoPermsToClaimTitle)
        .setDescription(
          msgconfig.Ticket.ClaimTickets.NoPermsToClaim.replace('%channel%', ticketChannel.name)
        )
        .setColor(supportbot.Embed.Colours.Error);

      if (!interaction.member.roles.cache.has(Staff.id) && !interaction.member.roles.cache.has(Admin.id)) {
        return interaction.reply({
          embeds: [NoPermsClaim],
          ephemeral: true,
        });
      }

      await ticketChannel.members.add(interaction.user.id);
      const pingclaimedstaff = await ticketChannel.send(`<@${interaction.user.id}>`);

      setTimeout(() => {
        pingclaimedstaff.delete();
      }, 2000)

      const TicketData = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
      const ticketIndex = TicketData.tickets.findIndex((t) => t.id === ticketChannelId);
      if (ticketIndex !== -1) {
        TicketData.tickets[ticketIndex].claimedBy = interaction.user.id;
        TicketData.tickets[ticketIndex].claimedAt = new Date().toISOString();
        fs.writeFileSync("./Data/TicketData.json", JSON.stringify(TicketData, null, 4));
      }

      const claimMessage = await interaction.message.fetch();
      const claimedEmbed = new Discord.EmbedBuilder(claimMessage.embeds[0].data)
        .setTitle(msgconfig.Ticket.ClaimTickets.ClaimedTitle)
        .setDescription(
          msgconfig.Ticket.ClaimTickets.ClaimMessage_Edit.replace('%user%', interaction.user.id).replace('%channel%', ticketChannel.id)
        )
        .setColor(supportbot.Embed.Colours.Success);

      const successfullyClaimed = new Discord.EmbedBuilder()
        .setTitle(msgconfig.Ticket.ClaimTickets.ClaimedTitle)
        .setDescription(msgconfig.Ticket.ClaimTickets.Claimed.replace('%channel%', ticketChannel.id))
        .setColor(supportbot.Embed.Colours.Success);

      await claimMessage.edit({ embeds: [claimedEmbed], components: [] });
      await interaction.reply({
        embeds: [successfullyClaimed],
        ephemeral: true,
      });
    }
  }

  async function handleInvites(interaction, enable) {
    if (supportbot.Ticket.Invites.StaffOnly) {
      const SupportStaff = await getRole(supportbot.Roles.StaffMember.Staff, interaction.guild);
      const Admin = await getRole(supportbot.Roles.StaffMember.Admin, interaction.guild);

      if (!SupportStaff || !Admin) {
        return interaction.reply("Some roles seem to be missing!\nPlease check for errors when starting the bot.");
      }

      const NoPerms = new Discord.EmbedBuilder()
        .setTitle("Invalid Permissions!")
        .setDescription(
          `${msgconfig.Error.IncorrectPerms}\n\nRole Required: \`${supportbot.Roles.StaffMember.Staff}\` or \`${supportbot.Roles.StaffMember.Admin}\``
        )
        .setColor(supportbot.Embed.Colours.Warn);

      if (!interaction.member.roles.cache.has(SupportStaff.id) && !interaction.member.roles.cache.has(Admin.id)) {
        return interaction.reply({ embeds: [NoPerms] });
      }
    }

    await interaction.channel.setInvitable(enable);

    const message = enable ? msgconfig.Ticket.EnableInvites : msgconfig.Ticket.DisableInvites;
    const embed = new Discord.EmbedBuilder()
      .setDescription(message)
      .setColor(supportbot.Embed.Colours.General);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }
});