// SupportBot | Emerald Services
// Ticket Add Command

const fs = require("fs");

const Discord = require("discord.js");
const yaml = require("js-yaml");
const supportbot = yaml.load(
  fs.readFileSync("./Configs/supportbot.yml", "utf8")
);
const cmdconfig = yaml.load(fs.readFileSync("./Configs/commands.yml", "utf8"));

const Command = require("../Structures/Command.js");

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

module.exports = new Command({
  name: cmdconfig.TicketAdd,
  description: cmdconfig.TicketAddDesc,
  slashCommandOptions: [
    {
      name: "user",
      description: "User to add",
      type: "USER",
      required: true,
    },
  ],
  permission: "SEND_MESSAGES",

  async run(interaction) {
    let SupportStaff = interaction.guild.roles.cache.find(
      (SupportTeam) =>
        SupportTeam.name == supportbot.Staff ||
        SupportTeam.id == supportbot.Staff
    );
    let Admins = interaction.guild.roles.cache.find(
      (AdminUser) =>
        AdminUser.name == supportbot.Admin || AdminUser.id == supportbot.Admin
    );
    if (!SupportStaff || !Admins)
      return interaction.reply(
        "Some roles seem to be missing!\nPlease check for errors when starting the bot."
      );

    const NoPerms = new Discord.MessageEmbed()
      .setTitle("Invalid Permissions!")
      .setDescription(
        `${supportbot.IncorrectPerms}\n\nRole Required: \`${supportbot.Staff}\` or \`${supportbot.Admin}\``
      )
      .setColor(supportbot.WarningColour);

    if (
      interaction.member.roles.cache.has(SupportStaff.id) ||
      interaction.member.roles.cache.has(Admins.id)
    ) {
      if (!interaction.channel.name.startsWith(`${supportbot.TicketPrefix}`)) {
        const Exists = new Discord.MessageEmbed()
          .setTitle("No Ticket Found!")
          .setDescription(`${supportbot.NoValidTicket}`)
          .setColor(supportbot.WarningColour);
        return interaction.reply({ embeds: [Exists] });
      }

      let uMember = interaction.options.getUser("user");
      const UserNotExist = new Discord.MessageEmbed()
        .setTitle("User Not Found!")
        .setDescription(
          `${supportbot.UserNotFound}\n\nTry Again:\`/${cmdconfig.TicketAdd} <user#0000>\``
        )
        .setColor(supportbot.ErrorColour);

      if (!uMember) return interaction.reply({ embeds: [UserNotExist] });

      interaction.channel.permissionOverwrites.edit(uMember, {
        VIEW_CHANNEL: true,
        READ_MESSAGE_HISTORY: true,
        SEND_MESSAGES: true,
      });

      const Complete = new Discord.MessageEmbed()
        .setTitle("User Added!")
        .setDescription(supportbot.AddedUser.replace(/%user%/g, uMember.id))
        .setTimestamp()
        .setColor(supportbot.EmbedColour);
      interaction.reply({ embeds: [Complete] });
    } else {
      return interaction.reply({ embeds: [NoPerms] });
    }
  },
});