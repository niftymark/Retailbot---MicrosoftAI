using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using ChatBot.Models;
using ChatBot.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.CognitiveServices.Vision.Face.Models;
using Microsoft.Extensions.Options;

namespace ChatBot.Controllers
{
    [Route("api/face-recognition")]
    [Produces("application/json")]
    public class FaceRecognitionController : Controller
    {
        private readonly FaceRecognitionService _faceRecognitionService;

        public FaceRecognitionController(FaceRecognitionService faceRecognitionService)
        {
            _faceRecognitionService = faceRecognitionService;
        }

        /// <summary>
        /// Verify if one face belongs to a person.
        /// </summary>
        /// <returns>A successful call returns the verification result.</returns>
        [Route("persons/recognize"), HttpPost]
        public async Task<IActionResult> RecognizePersonFace(IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest("[file] is required");
            }

            FaceRecognitionResult response = null;
            using (var fileStream = file.OpenReadStream())
            {
                response = await _faceRecognitionService.RecognizeFaceAsync(fileStream);
                if (response == null)
                {
                    return NotFound("Person not found in the system. Please register the person first.");
                }
            }

            return Ok(response);

        }

        /// <summary>
        /// Creates a new person.
        /// </summary>
        /// <returns>A successful call returns a new personId created. </returns>
        [Route("persons/{personName}"), HttpPost]
        public async Task<IActionResult> CreatePerson(string personName, IFormFile file)
        {
            if (string.IsNullOrEmpty(personName))
            {
                return BadRequest("[personName] is required");
            }

            if (file == null || file.Length == 0)
            {
                return BadRequest("[file] is required");
            }

            var response = await _faceRecognitionService.CreatePersonAsync(personName);
            using (var fileStream = file.OpenReadStream())
            {
                await _faceRecognitionService.AddPersonFaceAsync(response, fileStream);
            }

            return Ok(response);
        }
    }
}