using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using ChatBot.Options;
using Microsoft.Bot.Configuration;
using Microsoft.Bot.Connector;
using Microsoft.Bot.Schema;

namespace ChatBot.Utils
{
    public static class BotUtils
    {
        private const string ValidAudioContentTypes = @"^audio/(wav)$";

        public static ConnectorClient GetConnectorClient(string serviceUrl, BotConfigOptions botConfigOptions)
        {
            if (botConfigOptions != null && string.IsNullOrEmpty(botConfigOptions.MicrosoftAppId))
            {
                var appId = botConfigOptions.MicrosoftAppId;
                var appPassword = botConfigOptions.MicrosoftAppPassword;
                return new ConnectorClient(new Uri(serviceUrl), appId, appPassword);
            }

            return new ConnectorClient(new Uri(serviceUrl));
        }

        /// <summary>
        /// Uploads a file and creates an <see cref="Attachment"/> with the uploaded file url.
        /// </summary>
        /// <returns>An attachment.</returns>
        public static async Task<Attachment> CreateAndUploadAttachmentAsync(string serviceUrl, string type, string conversationId, byte[] file, string attName, BotConfigOptions _botConfigOptions)
        {
            // Create a connector client to use to upload the image.
            using (var connector = BotUtils.GetConnectorClient(serviceUrl, _botConfigOptions))
            {
                var attachments = new Attachments(connector);
                var response = await attachments.Client.Conversations.UploadAttachmentAsync(
                    conversationId,
                    new AttachmentData
                    {
                        Name = attName,
                        OriginalBase64 = file,
                        Type = type,
                    });

                var attachmentUri = attachments.GetAttachmentUri(response.Id);

                return new Attachment
                {
                    Name = attName,
                    ContentType = type,
                    ContentUrl = attachmentUri,
                };
            }
        }

        public static AudioCard CreateAudioCard(string title, string text, string attachmentUrl)
        {
            return new AudioCard
            {
                Title = title,
                Text = text,
                Media = new List<MediaUrl>
                {
                    new MediaUrl()
                    {
                        Url = attachmentUrl,
                    },
                },
            };
        }

        /// <summary>
        /// Detects whether the user sends an audio message.
        /// </summary>
        /// <param name="activity">Incoming message</param>
        /// <returns>Returns string with blob url if the activity is considered an "audio" otherwise null</returns>
        public static string GetAudioUploadUrl(Activity activity)
        {
            var regex = new Regex(ValidAudioContentTypes, RegexOptions.IgnoreCase);

            var attachment = ((List<Attachment>)activity?.Attachments)?
              .FirstOrDefault(item => regex.Matches(item.ContentType).Count > 0);

            return attachment?.ContentUrl;
        }
    }
}
