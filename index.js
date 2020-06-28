const inquirer = require('inquirer');
const fs = require('fs');
const util = require('util');

require('dotenv').config();

const writeFileAsync = util.promisify(fs.writeFile);

function promptUser() {
  return inquirer.prompt([
    {
        type: "input",
        name: "project title",
        message: "What is the name of your project?"
    },
    {
        type: "input",
        name: "description",
        message: "Describe your project."
    // },
    // {

    // },
    // {

    // },
    // {

    // },
    // {

    // },
    // {

    // },
    // {

    // },
    // {

    // },
    // {
    //[]
    }
  ]);
}

function generateMarkdown(answers) {
  return `  <h1 align= "center">{answers.title}</h1> 
  <h2>Table of Contents<h2>
  <ul>
  <li><a href="#descrip">Description</a></li>  
  <li><a href="#install">Installation</a></li> 
  <li><a href="#tech">Technology</a></li> 
  <li><a href="#use">Usage</a></li> 
  <li><a href="#license">License</a></li>
  <li><a href="#screen">Screenshots</a></li> 
  <li><a href="#contr">Contributors</a></li> 
  <li><a href="#quest">Questions</a></li>  
  </ul>
    <hr>
  <div id="descrip"><h2>Description</h2> </div>
  {answers.description}
  <hr>
  <div id="install"><h2>Installation</h2> </div>
  <p>{answers.install}</p>
  <hr>
  <div id="tech"><h2>Technology</h2></div>           
  <p>{answers.tech}</p>
  <hr>
  <div id="use"><h2>Usage</h2></div>
  <p>Reference information </p>  
  <hr>
  <div id="license"><h2>License</h2></div>
  <p><img align="left" src= "https://img.shields.io/badge/License-MIT-blue"></p><br>
  <hr>
  <div id="screen"><h2>Screenshots</h2></div>
  <p><img src= ""><img src= ""><img src= ""></p>
  <hr>
  <div id="contr"><h2>Contributors</h2> </div>

  Gregory Clark       
  <ul>
  <li>Github: <a href= "https://github.com/gregroyclark/">https://github.com/gregroyclark/</a></li>
  <li>Portfolio: <a href= "https://gregroyclark.github.io/">https://gregroyclark.github.io/</a></li>    
  <li>LinkedIn: <a href= "https://www.linkedin.com/in/gregoryclark">https://www.linkedin.com/in/gregoryclark</a></li>
  </ul> `;
}

async function init() {
  console.log("hi")
  try {
    const answers = await promptUser();

    const md = generateMarkdown(answers);

    await writeFileAsync("README.md", md);

    console.log("Successfully wrote to README.md");
  } catch(err) {
    console.log(err);
  }
}

init();