using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ChatBot.Models;
using ChatBot.Options;
using ChatBot.Services;
using ChatBot.Utils;
using Microsoft.Azure.CognitiveServices.Vision.Face.Models;
using Microsoft.Bot.Builder;
using Microsoft.Bot.Builder.Dialogs;
using Microsoft.Bot.Configuration;
using Microsoft.Bot.Schema;
using Microsoft.Extensions.Configuration;

namespace ChatBot.Dialogs
{
    public class TellMeWhatToWearDialog : ComponentDialog
    {
        private const string AttachmentName = "AudioRequestPicture";

        // Prompts names
        private const string UploadPicturePrompt = "uploadPicturePrompt";
        private const string FindSimilarProductsPrompt = "findSimilarProductsPrompt";

        // Minimum length requirements for city and name
        private const int NameLengthMinValue = 3;
        private const int CityLengthMinValue = 5;

        // Dialog IDs
        private const string FindSimilarProductsDialog = "findSimilarProductsDialog";

        private readonly BotConfigOptions _botConfigOptions;

        public TellMeWhatToWearDialog(IStatePropertyAccessor<Models.UserData> userDataStateAccessor, IConfiguration configuration, BotConfigOptions botConfigOptions)
            : base(nameof(TellMeWhatToWearDialog))
        {
            UserStateAccessor = userDataStateAccessor ?? throw new ArgumentNullException(nameof(userDataStateAccessor));
            ProductService = new ProductService(configuration);
            SpeechService = new SpeechService(configuration);
            _botConfigOptions = botConfigOptions;

            // Add control flow dialogs
            var waterfallSteps = new WaterfallStep[]
            {
                UploadPictureStepAsync,
                FindSimilarProductsStepAsync,
            };
            AddDialog(new WaterfallDialog(FindSimilarProductsDialog, waterfallSteps));
            AddDialog(new AttachmentPrompt(UploadPicturePrompt));
            AddDialog(new TextPrompt(FindSimilarProductsPrompt));
        }

        public IStatePropertyAccessor<Models.UserData> UserStateAccessor { get; }

        public ProductService ProductService { get; }

        public SpeechService SpeechService { get; }

        private async Task<DialogTurnResult> UploadPictureStepAsync(WaterfallStepContext stepContext, CancellationToken cancellationToken)
        {
            var reply = stepContext.Context.Activity.CreateReply();
            var replyText = "click on the camera icon and upload a picture of yourself to show your style!";

            // Add audio response as an attachment

            var audioResponse = await SpeechService.SynthesizeSpeechAsync(replyText);
            var audioAttachment = await BotUtils.CreateAndUploadAttachmentAsync(reply.ServiceUrl, "audio/wav", reply.Conversation.Id, audioResponse, AttachmentName, _botConfigOptions);
            reply.Attachments = new List<Attachment> { BotUtils.CreateAudioCard("Photo Request", replyText, audioAttachment.ContentUrl).ToAttachment() };

            return await stepContext.PromptAsync(UploadPicturePrompt, new PromptOptions { Prompt = reply }, cancellationToken);
        }

        private async Task<DialogTurnResult> FindSimilarProductsStepAsync(WaterfallStepContext stepContext, CancellationToken cancellationToken)
        {
            var userData = await UserStateAccessor.GetAsync(stepContext.Context, () => new Models.UserData(), cancellationToken);
            var activity = stepContext.Context.Activity;
            var reply = activity.CreateReply();

            // Search for the uploaded picture in the attachments
            if (activity.Attachments != null && activity.Attachments.Any())
            {
                var file = activity.Attachments[0];

                // Using the gender from Face Recognition we can get the customer category (Women, Men, Boys, Girls...) and filter suggested products.
                var category = userData.Gender.Equals("female", StringComparison.InvariantCultureIgnoreCase) ? CustomerCategory.Women : CustomerCategory.Men;
                var similarProducts = await ProductService.GetSuggestedProductsByGenderAsync(file.ContentUrl, category);
                var similarProductsAttachment = new Attachment
                {
                    Content = new Dictionary<string, SuggestedProductsResult>
                    {
                        { "products", similarProducts },
                    },
                    ContentType = "text/plain",
                    Name = "products",
                };

                var msg = "I found these similar products. Let me know if you have any questions.";
                reply.AttachmentLayout = AttachmentLayoutTypes.Carousel;
                reply.Text = msg;

                // Add audio response as an attachment

                var audioResponse = await SpeechService.SynthesizeSpeechAsync(msg);
                var audioAttachment = await BotUtils.CreateAndUploadAttachmentAsync(reply.ServiceUrl, "audio/wav", reply.Conversation.Id, audioResponse, AttachmentName, _botConfigOptions);
                reply.Attachments = new List<Attachment>
                {
                    similarProductsAttachment,
                    BotUtils.CreateAudioCard("Similar products", reply.Text, audioAttachment.ContentUrl).ToAttachment(),
                };

                // Send the card(s) to the user as an attachment to the activity
                await stepContext.Context.SendActivityAsync(reply, cancellationToken);

                // We end the dialog flow on this step as we don't need any other confirmation at this point.
                return await stepContext.EndDialogAsync(cancellationToken: cancellationToken);
            }
            else
            {
                return await stepContext.PromptAsync(UploadPicturePrompt, new PromptOptions { Prompt = MessageFactory.Text("Please upload an image") }, cancellationToken);
            }
        }
    }
}
