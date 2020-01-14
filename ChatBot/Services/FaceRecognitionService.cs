using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using ChatBot.Models;
using ChatBot.Utils;
using Microsoft.Azure.CognitiveServices.Vision.Face;
using Microsoft.Azure.CognitiveServices.Vision.Face.Models;

namespace ChatBot.Services
{
    public class FaceRecognitionService
    {
        private static readonly FaceAttributeType[] FaceAttributes =
            {
                FaceAttributeType.Age,
                FaceAttributeType.Gender,
                FaceAttributeType.Emotion
            };

        private static string _personGroupId = string.Empty;
        private readonly string _accountKey;
        private readonly FaceClient _faceClient;

        public FaceRecognitionService(string accountKey, string region)
        {
            _accountKey = accountKey;
            _faceClient = new FaceClient(new ApiKeyServiceClientCredentials(accountKey));
            _faceClient.Endpoint = $"https://{region}.api.cognitive.microsoft.com";
        }

        public async Task AddPersonFaceAsync(Guid personId, Stream image)
        {
            var personGroupId = await GetPersonGroupIdAsync();
            await _faceClient.PersonGroupPerson.AddFaceFromStreamAsync(personGroupId, personId, image);
            await _faceClient.PersonGroup.TrainAsync(personGroupId);
        }

        public async Task<FaceRecognitionResult> RecognizeFaceAsync(Stream imageStream)
        {
            // Copy the stream to use it later for verification
            var faceIdentificationStream = ImageUtils.CopyImageStream(imageStream);
            var faceVerificationStream = ImageUtils.CopyImageStream(imageStream);

            // Get face id from image
            var faceDetectResponse = await FaceDetectAsync(imageStream);
            if (faceDetectResponse == null)
            {
                return new FaceRecognitionResult { IsValid = false };
            }

            // Find a person match using identify
            var person = await IdentifyFaceAsync(faceIdentificationStream);

            if (person == null)
            {
                return null;
            }

            // Verify if the face belongs to the person
            var verifyResult = await VerifyPersonAsync(person.PersonId, faceVerificationStream);
            var result = new FaceRecognitionResult
            {
                IsValid = verifyResult.IsIdentical
            };
            if (verifyResult.IsIdentical)
            {
                result.Name = person.Name;
                result.Gender = faceDetectResponse.FaceAttributes.Gender.ToString();
            }

            return result;
        }

        public async Task<VerifyResult> VerifyPersonAsync(Guid personId, Stream image)
        {
            // Get face id from image
            var faceDetectResponse = await FaceDetectAsync(image);
            if (faceDetectResponse == null)
            {
                return new VerifyResult { IsIdentical = false };
            }

            var personGroupId = await GetPersonGroupIdAsync();
            var verifyResult = await _faceClient.Face.VerifyFaceToPersonAsync(faceDetectResponse.FaceId.Value, personId, personGroupId);
            return verifyResult;
        }

        public async Task<Person> IdentifyFaceAsync(Stream image)
        {
            // Get face id from image
            var faceDetectResponse = await FaceDetectAsync(image);
            if (faceDetectResponse == null)
            {
                return null;
            }

            var personGroupId = await GetPersonGroupIdAsync();

            var result = await _faceClient.Face.IdentifyAsync(new List<Guid> { faceDetectResponse.FaceId.Value }, personGroupId);
            var bestCandidate = result.SelectMany(r => r.Candidates).OrderByDescending(c => c.Confidence).FirstOrDefault();

            if (bestCandidate == null)
            {
                return null;
            }

            var person = await _faceClient.PersonGroupPerson.GetAsync(personGroupId, bestCandidate.PersonId);
            return person;
        }

        public async Task<Guid> CreatePersonAsync(string personName)
        {
            var personGroupId = await GetPersonGroupIdAsync();
            var person = await _faceClient.PersonGroupPerson.CreateAsync(personGroupId, personName);
            return person.PersonId;
        }

        public async Task<DetectedFace> FaceDetectAsync(Stream imageStream)
        {
            try
            {
                IList<DetectedFace> faceList =
                            await _faceClient.Face.DetectWithStreamAsync(
                                imageStream, true, false, FaceAttributes);
                return faceList.FirstOrDefault();
            }
            catch (APIErrorException e)
            {
                Console.WriteLine(e.Message);
            }

            return null;
        }

        private async Task<string> GetPersonGroupIdAsync()
        {
            if (string.IsNullOrEmpty(_personGroupId))
            {
                var personGroups = await _faceClient.PersonGroup.ListAsync();

                // Only create one person group for this lab
                if (personGroups.Any())
                {
                    _personGroupId = personGroups.FirstOrDefault()?.PersonGroupId;
                }
                else
                {
                    var localPersonGroupId = Guid.NewGuid().ToString();
                    await _faceClient.PersonGroup.CreateAsync(localPersonGroupId, localPersonGroupId);
                    _personGroupId = localPersonGroupId;
                }
            }

            return _personGroupId;
        }
    }
}
